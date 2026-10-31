/*
 * RoutingService communicates with OpenRouteService to perform address geocoding,
 * direct routing, waypoint-guided routing, and retrieving points of interest (gas stations) along the route.
 */
using System.Text;
using System.Text.Json;

namespace FuelOptimizer.Api.Services;

public class RoutingService
{
    private readonly HttpClient _httpClient;
    private readonly string? _apiKey;
    private readonly string? _baseUrl;
    private readonly ILogger<RoutingService> _logger;

    public RoutingService(HttpClient httpClient, IConfiguration configuration, ILogger<RoutingService> logger)
    {
        _httpClient = httpClient;
        _apiKey = configuration["OpenRouteService:ApiKey"];
        _baseUrl = configuration["OpenRouteService:BaseUrl"];
        _logger = logger;
    }

    public async Task<double[]?> GetGeocodeAsync(string address)
    {
        try
        {
            var requestUrl = $"{_baseUrl}/geocode/search?api_key={_apiKey}&text={Uri.EscapeDataString(address)}&size=1";
            var request = new HttpRequestMessage(HttpMethod.Get, requestUrl);
            request.Headers.Add("User-Agent", "FuelOptimizer");

            var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Geocode request failed with status {StatusCode} for address '{Address}'", response.StatusCode, address);
                return null;
            }

            var content = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(content);
            var features = doc.RootElement.GetProperty("features");
            if (features.GetArrayLength() == 0) return null;
            var coordinates = features[0].GetProperty("geometry").GetProperty("coordinates");
            return new double[] { coordinates[1].GetDouble(), coordinates[0].GetDouble() };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error geocoding address '{Address}'", address);
            return null;
        }
    }

    public async Task<JsonElement> GetRouteAsync(double[] start, double[] end, List<double[]>? waypoints = null)
    {
        try
        {
            var requestUrl = $"{_baseUrl}/v2/directions/driving-car/geojson";
            
            var coordsList = new List<double[]>();
            coordsList.Add(new[] { start[1], start[0] });
            if (waypoints != null)
            {
                foreach (var wp in waypoints)
                {
                    coordsList.Add(new[] { wp[1], wp[0] });
                }
            }
            coordsList.Add(new[] { end[1], end[0] });

            var radiusesList = new List<int>();
            for (int i = 0; i < coordsList.Count; i++)
            {
                radiusesList.Add(-1);
            }

            var body = new { 
                coordinates = coordsList.ToArray(),
                radiuses = radiusesList.ToArray()
            };
            var json = JsonSerializer.Serialize(body);

            var request = new HttpRequestMessage(HttpMethod.Post, requestUrl);
            request.Headers.TryAddWithoutValidation("Authorization", _apiKey);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Route request failed with status {StatusCode}: {Content}", response.StatusCode, content);
                if (response.StatusCode == System.Net.HttpStatusCode.BadRequest || response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    throw new ArgumentException("Could not find a driving route between these locations. Please check the spelling of your cities (e.g. Vilnius instead of Vilnus).");
                }
                throw new HttpRequestException($"Routing service returned {(int)response.StatusCode}");
            }
            using var doc = JsonDocument.Parse(content);
            return doc.RootElement.Clone();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting route with waypoints");
            throw;
        }
    }

    public async Task<JsonElement> GetGasStationsAsync(JsonElement routeGeometry)
    {
        try
        {
            var requestUrl = $"{_baseUrl}/pois";
            var body = new
            {
                request = "pois",
                geometry = new
                {
                    geojson = routeGeometry,
                    buffer = 1000
                },
                filters = new { category_group_ids = new[] { 160 } }
            };
            var json = JsonSerializer.Serialize(body);

            var request = new HttpRequestMessage(HttpMethod.Post, requestUrl);
            request.Headers.TryAddWithoutValidation("Authorization", _apiKey);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("POI request failed with status {StatusCode}: {Content}", response.StatusCode, content);
                throw new HttpRequestException($"POI service returned {(int)response.StatusCode}");
            }
            using var doc = JsonDocument.Parse(content);
            return doc.RootElement.Clone();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting gas stations along route");
            throw;
        }
    }
}
