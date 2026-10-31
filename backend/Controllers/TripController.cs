using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using FuelOptimizer.Api.Models;
using FuelOptimizer.Api.Services;
using System.Text.Json;

/*
 * TripController handles HTTP API requests for route planning, fuel optimization,
 * and historical trip logging. It connects routing, fuel price retrieval, and optimization logic.
 */
namespace FuelOptimizer.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TripController : ControllerBase
{
    private readonly RoutingService _routingService;
    private readonly OptimizationService _optimizationService;
    private readonly FuelOptimizerContext _db;
    private readonly TankerkoenigService _tankerkoenigService;

    public TripController(RoutingService routingService, OptimizationService optimizationService, FuelOptimizerContext db, TankerkoenigService tankerkoenigService)
    {
        _routingService = routingService;
        _optimizationService = optimizationService;
        _db = db;
        _tankerkoenigService = tankerkoenigService;
    }

    [HttpPost("calculate")]
    public async Task<ActionResult<TripResponse>> CalculateTrip([FromBody] TripRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Origin))
            return BadRequest("Origin is required.");
        if (string.IsNullOrWhiteSpace(request.Destination))
            return BadRequest("Destination is required.");

        if (request.Origin.Length > 100)
            return BadRequest("Origin city name must be 100 characters or less.");
        if (request.Destination.Length > 100)
            return BadRequest("Destination city name must be 100 characters or less.");

        if (request.FuelConsumption < 0.1 || request.FuelConsumption > 100.0)
            return BadRequest("Fuel consumption must be between 0.1 and 100.0.");
        if (request.FuelTankCapacity < 1.0 || request.FuelTankCapacity > 1000.0)
            return BadRequest("Fuel tank capacity must be between 1.0 and 1000.0.");
        if (request.CurrentFuelPercent < 0.0 || request.CurrentFuelPercent > 100.0)
            return BadRequest("Current fuel percentage must be between 0.0 and 100.0.");

        if (request.FuelType != "Petrol" && request.FuelType != "Diesel" && request.FuelType != "Electric")
            return BadRequest($"Invalid FuelType '{request.FuelType}'. Allowed values: Petrol, Diesel, Electric.");

        var startCoords = TryParseCoordinates(request.Origin);
        if (startCoords == null)
        {
            startCoords = await _routingService.GetGeocodeAsync(request.Origin);
        }
        if (startCoords == null)
            return BadRequest("Origin location could not be resolved. Please enter a valid city name.");

        var endCoords = TryParseCoordinates(request.Destination);
        if (endCoords == null)
        {
            endCoords = await _routingService.GetGeocodeAsync(request.Destination);
        }
        if (endCoords == null)
            return BadRequest("Destination location could not be resolved. Please enter a valid city name.");

        JsonElement routeDoc;
        try
        {
            routeDoc = await _routingService.GetRouteAsync(startCoords, endCoords);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception)
        {
            return StatusCode(502, "Routing service is currently unavailable. Please try again later.");
        }

        JsonElement routeFeature;
        JsonElement summary;
        double distance;
        JsonElement geometry;
        JsonElement routeCoordsArray;

        try
        {
            if (!routeDoc.TryGetProperty("features", out var features) || features.GetArrayLength() == 0)
            {
                return BadRequest("Could not find a valid driving route between these locations.");
            }
            routeFeature = features[0];
            summary = routeFeature.GetProperty("properties").GetProperty("summary");
            distance = summary.GetProperty("distance").GetDouble() / 1000.0;
            geometry = routeFeature.GetProperty("geometry");
            routeCoordsArray = geometry.GetProperty("coordinates");
        }
        catch (Exception)
        {
            return StatusCode(502, "Failed to parse route data. Please check your locations and try again.");
        }

        if (distance > 2000)
            return BadRequest("Trip distance exceeds the maximum allowed limit of 2000 km.");

        // Build cumulative distance array for the route (used for accurate station placement)
        var cumulativeDistances = BuildCumulativeDistances(routeCoordsArray);

        var stations = new List<FuelStop>();
        var random = new Random();

        // Electric vehicles: skip gas station APIs entirely, generate charging stations
        if (request.FuelType == "Electric")
        {
            stations = GenerateSimulatedStations(
                routeCoordsArray, cumulativeDistances, distance, random,
                namePrefix: "Charging Station",
                minPrice: 0.35, maxPrice: 0.55
            );
        }
        else
        {
            var allRealStations = new List<TankerkoenigStation>();
            if (_tankerkoenigService.IsConfigured)
            {
                try
                {
                    double stepKm = 45.0;
                    double nextQueryKm = 0.0;
                    var queryCoords = new List<double[]>();

                    for (int i = 0; i < routeCoordsArray.GetArrayLength(); i++)
                    {
                        if (cumulativeDistances[i] >= nextQueryKm || i == 0 || i == routeCoordsArray.GetArrayLength() - 1)
                        {
                            var coord = routeCoordsArray[i];
                            double lat = coord[1].GetDouble();
                            double lng = coord[0].GetDouble();

                            if (lat >= 47.2 && lat <= 55.1 && lng >= 5.8 && lng <= 15.2)
                            {
                                queryCoords.Add(new[] { lat, lng });
                            }
                            nextQueryKm = cumulativeDistances[i] + stepKm;
                        }
                    }

                    var tasks = queryCoords.Select(qc => _tankerkoenigService.SearchStationsAsync(qc[0], qc[1], radiusKm: 25));
                    var results = await Task.WhenAll(tasks);

                    foreach (var fetched in results)
                    {
                        if (fetched != null && fetched.Count > 0)
                        {
                            foreach (var s in fetched)
                            {
                                if (!allRealStations.Any(x => x.Id == s.Id))
                                {
                                    allRealStations.Add(s);
                                }
                            }
                        }
                    }
                }
                catch (Exception)
                {
                }
            }

            try
            {
                var poiDoc = await _routingService.GetGasStationsAsync(geometry);
                if (poiDoc.TryGetProperty("features", out var features))
                {
                    for (int i = 0; i < features.GetArrayLength(); i++)
                    {
                        var f = features[i];
                        var coords = f.GetProperty("geometry").GetProperty("coordinates");
                        double stationLat = coords[1].GetDouble();
                        double stationLng = coords[0].GetDouble();
                        string stationName = "Gas Station";
                        double price = Math.Round(1.6 + random.NextDouble() * 0.3, 2);

                        if (allRealStations.Count > 0)
                        {
                            var closest = allRealStations
                                .Select(ts => new { Station = ts, Dist = HaversineDistanceKm(stationLat, stationLng, ts.Lat, ts.Lng) })
                                .OrderBy(x => x.Dist)
                                .FirstOrDefault();

                            if (closest != null && closest.Dist <= 15.0)
                            {
                                var ts = closest.Station;
                                stationName = string.IsNullOrEmpty(ts.Name) ? ts.Brand : ts.Name;

                                double? realPrice = request.FuelType == "Diesel" ? ts.Diesel : ts.E5;
                                if (realPrice.HasValue && realPrice.Value > 0)
                                    price = realPrice.Value;

                                stationLat = ts.Lat;
                                stationLng = ts.Lng;
                            }
                        }

                        stations.Add(new FuelStop
                        {
                            StationName = stationName,
                            Latitude = stationLat,
                            Longitude = stationLng,
                            PricePerLiter = price,
                            AmountToRefuel = 0,
                            DistanceAlongRouteKm = 0 // will be recalculated below
                        });
                    }
                    
                    if (stations.Count == 0) throw new Exception("Zero stations found by API");
                }
                else
                {
                    throw new Exception("API limit exceeded or no features array");
                }
            }
            catch
            {
                // Fallback: generate simulated stations along route using Haversine
                stations.Clear();
                stations = GenerateSimulatedStations(
                    routeCoordsArray, cumulativeDistances, distance, random,
                    namePrefix: "Simulated Station",
                    minPrice: 1.60, maxPrice: 1.90
                );

                // Even for simulated stations, try Tankerkoenig for real prices in Germany
                if (allRealStations.Count > 0)
                {
                    for (int i = 0; i < stations.Count; i++)
                    {
                        var s = stations[i];
                        var closest = allRealStations
                            .Select(ts => new { Station = ts, Dist = HaversineDistanceKm(s.Latitude, s.Longitude, ts.Lat, ts.Lng) })
                            .OrderBy(x => x.Dist)
                            .FirstOrDefault();

                        if (closest != null && closest.Dist <= 15.0)
                        {
                            var ts = closest.Station;
                            s.StationName = string.IsNullOrEmpty(ts.Name) ? ts.Brand : ts.Name;

                            double? realPrice = request.FuelType == "Diesel" ? ts.Diesel : ts.E5;
                            if (realPrice.HasValue && realPrice.Value > 0)
                                s.PricePerLiter = realPrice.Value;

                            s.Latitude = ts.Lat;
                            s.Longitude = ts.Lng;
                        }
                    }
                }
            }
        }

        // Recalculate DistanceAlongRouteKm for ALL stations by projecting onto the route
        foreach (var station in stations)
        {
            station.DistanceAlongRouteKm = ProjectOntoRoute(
                station.Latitude, station.Longitude,
                routeCoordsArray, cumulativeDistances
            );
        }

        // Sort stations by their distance along route (required by optimization algorithm)
        stations = stations.OrderBy(s => s.DistanceAlongRouteKm).ToList();

        var response = _optimizationService.OptimizeFuelStops(request, distance, stations);

        // Build waypoints for re-routing through recommended stops
        var waypoints = new List<double[]>();
        foreach (var stop in response.RecommendedStops)
        {
            waypoints.Add(new[] { stop.Latitude, stop.Longitude });
        }

        // Re-route with waypoints (limit to 40 to avoid ORS API limits)
        if (waypoints.Count > 0 && waypoints.Count <= 40)
        {
            try
            {
                var waypointedRouteDoc = await _routingService.GetRouteAsync(startCoords, endCoords, waypoints);
                if (waypointedRouteDoc.TryGetProperty("features", out var wpFeatures) && wpFeatures.GetArrayLength() > 0)
                {
                    var wpRouteFeature = wpFeatures[0];
                    var wpSummary = wpRouteFeature.GetProperty("properties").GetProperty("summary");
                    var wpDistance = wpSummary.GetProperty("distance").GetDouble() / 1000.0;
                    var wpGeometry = wpRouteFeature.GetProperty("geometry");

                    distance = wpDistance;
                    response.TotalDistanceKm = Math.Round(wpDistance, 2);
                    routeCoordsArray = wpGeometry.GetProperty("coordinates");
                }
            }
            catch (Exception)
            {
                // If re-routing fails, keep original route — this is not critical
            }
        }

        int splitIndex = routeCoordsArray.GetArrayLength();
        if (!response.IsPossible && response.TotalDistanceKm > 0)
        {
            splitIndex = (int)((response.StoppedAtKm / response.TotalDistanceKm) * routeCoordsArray.GetArrayLength());
            splitIndex = Math.Max(0, Math.Min(splitIndex, routeCoordsArray.GetArrayLength()));
        }

        for (int i = 0; i < routeCoordsArray.GetArrayLength(); i++)
        {
            var coord = routeCoordsArray[i];
            if (i <= splitIndex)
            {
                response.RouteCoordinates.Add(new[] { coord[1].GetDouble(), coord[0].GetDouble() });
            }
            else
            {
                response.UnreachableCoordinates.Add(new[] { coord[1].GetDouble(), coord[0].GetDouble() });
            }
        }

        string userId = Request.Headers["X-User-Id"].ToString();
        if (string.IsNullOrEmpty(userId)) userId = "anonymous";

        _db.TripHistory.Add(new TripHistoryEntry
        {
            Origin = request.Origin,
            Destination = request.Destination,
            DistanceKm = response.TotalDistanceKm,
            TotalCostEur = response.TotalCostEur,
            StopsCount = response.RecommendedStops.Count,
            FuelType = request.FuelType,
            VehicleProfile = $"{request.FuelConsumption}L/100km, {request.FuelTankCapacity}L tank",
            UserId = userId,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        return Ok(response);
    }

    /// <summary>
    /// Builds a cumulative distance array from the route coordinates.
    /// Each element stores the total distance in km from the route start to that point.
    /// </summary>
    private static double[] BuildCumulativeDistances(JsonElement routeCoordsArray)
    {
        int count = routeCoordsArray.GetArrayLength();
        var cumulative = new double[count];
        cumulative[0] = 0;

        for (int i = 1; i < count; i++)
        {
            var prev = routeCoordsArray[i - 1];
            var curr = routeCoordsArray[i];
            double lat1 = prev[1].GetDouble(), lng1 = prev[0].GetDouble();
            double lat2 = curr[1].GetDouble(), lng2 = curr[0].GetDouble();
            cumulative[i] = cumulative[i - 1] + HaversineDistanceKm(lat1, lng1, lat2, lng2);
        }

        return cumulative;
    }

    /// <summary>
    /// Projects a station's GPS coordinates onto the route polyline,
    /// returning the cumulative distance (km) along the route to the nearest point.
    /// </summary>
    private static double ProjectOntoRoute(double stationLat, double stationLng, JsonElement routeCoordsArray, double[] cumulativeDistances)
    {
        double minDist = double.MaxValue;
        int closestIdx = 0;

        for (int i = 0; i < routeCoordsArray.GetArrayLength(); i++)
        {
            var coord = routeCoordsArray[i];
            double lat = coord[1].GetDouble();
            double lng = coord[0].GetDouble();
            double dist = HaversineDistanceKm(stationLat, stationLng, lat, lng);
            if (dist < minDist)
            {
                minDist = dist;
                closestIdx = i;
            }
        }

        return Math.Round(cumulativeDistances[closestIdx], 2);
    }

    /// <summary>
    /// Generates simulated stations along the route every ~50 km using cumulative Haversine distances.
    /// </summary>
    private static List<FuelStop> GenerateSimulatedStations(
        JsonElement routeCoordsArray, double[] cumulativeDistances, double totalDistance,
        Random random, string namePrefix, double minPrice, double maxPrice)
    {
        var stations = new List<FuelStop>();
        double nextStopKm = 50.0;
        int stationNumber = 1;

        for (int i = 1; i < routeCoordsArray.GetArrayLength(); i++)
        {
            if (cumulativeDistances[i] >= nextStopKm && cumulativeDistances[i] < totalDistance - 10)
            {
                var coord = routeCoordsArray[i];
                double lat = coord[1].GetDouble();
                double lng = coord[0].GetDouble();

                stations.Add(new FuelStop
                {
                    StationName = $"{namePrefix} #{stationNumber}",
                    Latitude = lat,
                    Longitude = lng,
                    PricePerLiter = Math.Round(minPrice + random.NextDouble() * (maxPrice - minPrice), 2),
                    AmountToRefuel = 0,
                    DistanceAlongRouteKm = Math.Round(cumulativeDistances[i], 2)
                });

                stationNumber++;
                nextStopKm = cumulativeDistances[i] + 50.0;
            }
        }

        return stations;
    }

    /// <summary>
    /// Calculates the great-circle distance between two GPS coordinates using the Haversine formula.
    /// </summary>
    private static double HaversineDistanceKm(double lat1, double lng1, double lat2, double lng2)
    {
        const double R = 6371.0; // Earth's radius in km
        double dLat = (lat2 - lat1) * Math.PI / 180.0;
        double dLng = (lng2 - lng1) * Math.PI / 180.0;
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                 + Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0)
                 * Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
    }

    private static double[]? TryParseCoordinates(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var parts = input.Split(new[] { ',', ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 2)
        {
            if (double.TryParse(parts[0], System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lat) &&
                double.TryParse(parts[1], System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out double lng))
            {
                if (lat >= -90.0 && lat <= 90.0 && lng >= -180.0 && lng <= 180.0)
                {
                    return new[] { lat, lng };
                }
            }
        }
        return null;
    }

    [HttpGet("history")]
    public async Task<ActionResult> GetHistory()
    {
        string userId = Request.Headers["X-User-Id"].ToString();
        if (string.IsNullOrEmpty(userId)) userId = "anonymous";

        var history = await _db.TripHistory
            .Where(t => t.UserId == userId)
            .OrderByDescending(t => t.CreatedAt)
            .Take(20)
            .ToListAsync();
        return Ok(history);
    }

    [HttpGet("fuel-types")]
    public ActionResult<IEnumerable<string>> GetFuelTypes()
    {
        return Ok(new[] { "Petrol", "Diesel", "LPG", "Electric" });
    }
}
