/*
 * OptimizationService calculates the optimal fuel stop recommendations for a trip.
 * It uses a greedy approach to find the cheapest reachable fuel station along the route
 * and plans refuels dynamically to minimize overall travel cost while preventing running out of fuel.
 */
using FuelOptimizer.Api.Models;

namespace FuelOptimizer.Api.Services;

public class OptimizationService
{
    public TripResponse OptimizeFuelStops(TripRequest request, double totalDistance, List<FuelStop> stations)
    {
        var response = new TripResponse
        {
            TotalDistanceKm = Math.Round(totalDistance, 2),
            RecommendedStops = new List<FuelStop>()
        };

        if (request.FuelConsumption <= 0 || request.FuelTankCapacity <= 0)
            return response;

        double currentFuel = request.FuelTankCapacity * (request.CurrentFuelPercent / 100.0); 
        double currentPos = 0;
        double consumptionPerKm = request.FuelConsumption / 100.0;

        double safetyBuffer = Math.Min(2.0, request.FuelTankCapacity * 0.1);
        double effectiveBuffer = Math.Min(safetyBuffer, currentFuel * 0.5);

        while (currentPos + ((currentFuel - effectiveBuffer) / consumptionPerKm) < totalDistance - 0.1)
        {
            double maxReach = currentPos + ((currentFuel - effectiveBuffer) / consumptionPerKm);
            
            var reachableStations = stations
                .Where(s => s.DistanceAlongRouteKm > currentPos && s.DistanceAlongRouteKm <= maxReach)
                .OrderBy(s => s.PricePerLiter)
                .ToList();

            if (!reachableStations.Any()) 
            {
                response.IsPossible = false;
                response.StoppedAtKm = Math.Round(currentPos + (currentFuel / consumptionPerKm), 2);
                break;
            }

            var bestStation = reachableStations.First();
            
            double distanceDriven = bestStation.DistanceAlongRouteKm - currentPos;
            currentFuel -= distanceDriven * consumptionPerKm;

            effectiveBuffer = safetyBuffer;

            double fuelNeededToEnd = (totalDistance - bestStation.DistanceAlongRouteKm) * consumptionPerKm + safetyBuffer;
            if (fuelNeededToEnd <= request.FuelTankCapacity)
            {
                double neededFuel = Math.Max(0, fuelNeededToEnd - currentFuel);
                bestStation.AmountToRefuel = Math.Round(neededFuel, 2);
                currentFuel = currentFuel + neededFuel;
            }
            else
            {
                double neededFuel = request.FuelTankCapacity - currentFuel;
                bestStation.AmountToRefuel = Math.Round(neededFuel, 2);
                currentFuel = request.FuelTankCapacity;
            }

            response.RecommendedStops.Add(bestStation);
            currentPos = bestStation.DistanceAlongRouteKm; 
        }

        response.TotalCostEur = Math.Round(response.RecommendedStops.Sum(s => s.AmountToRefuel * s.PricePerLiter), 2);
        
        return response;
    }
}
