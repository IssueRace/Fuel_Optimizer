/*
 * TankerkoenigService retrieves real-time fuel prices from the Tankerkoenig API
 * for gas stations located near route waypoints in Germany, using caching to limit requests.
 */
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace FuelOptimizer.Api.Services;

public record TankerkoenigStation(string Id, string Name, string Brand, double Lat, double Lng, double? Diesel, double? E5, double? E10, bool IsOpen);

public class TankerkoenigService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly string? _apiKey;

    public TankerkoenigService(IHttpClientFactory httpClientFactory, IMemoryCache cache, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _apiKey = configuration["Tankerkoenig:ApiKey"];
    }

    public bool IsConfigured => !string.IsNullOrEmpty(_apiKey) && _apiKey != "00000000-0000-0000-0000-000000000002";

    public async Task<List<TankerkoenigStation>> SearchStationsAsync(double lat, double lng, double radiusKm = 5, string type = "all")
    {
        var cacheKey = $"tanker_{lat:F2}_{lng:F2}_{radiusKm}";
        if (_cache.TryGetValue(cacheKey, out List<TankerkoenigStation>? cached) && cached != null)
            return cached;

        try
        {
            var client = _httpClientFactory.CreateClient("Tankerkoenig");
            var url = $"https://creativecommons.tankerkoenig.de/json/list.php?lat={lat}&lng={lng}&rad={radiusKm}&sort=dist&type={type}&apikey={_apiKey}";
            var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
                return new List<TankerkoenigStation>();

            var content = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(content);
            var root = doc.RootElement;

            if (!root.TryGetProperty("ok", out var okProp) || !okProp.GetBoolean())
                return new List<TankerkoenigStation>();

            var stations = new List<TankerkoenigStation>();
            if (root.TryGetProperty("stations", out var stationsArray))
            {
                foreach (var s in stationsArray.EnumerateArray())
                {
                    stations.Add(new TankerkoenigStation(
                        Id: s.GetProperty("id").GetString() ?? "",
                        Name: s.GetProperty("name").GetString() ?? "",
                        Brand: s.TryGetProperty("brand", out var b) ? b.GetString() ?? "" : "",
                        Lat: s.GetProperty("lat").GetDouble(),
                        Lng: s.GetProperty("lng").GetDouble(),
                        Diesel: s.TryGetProperty("diesel", out var d) && d.ValueKind == JsonValueKind.Number ? d.GetDouble() : null,
                        E5: s.TryGetProperty("e5", out var e5) && e5.ValueKind == JsonValueKind.Number ? e5.GetDouble() : null,
                        E10: s.TryGetProperty("e10", out var e10) && e10.ValueKind == JsonValueKind.Number ? e10.GetDouble() : null,
                        IsOpen: s.TryGetProperty("isOpen", out var io) && io.GetBoolean()
                    ));
                }
            }

            _cache.Set(cacheKey, stations, TimeSpan.FromHours(1));
            return stations;
        }
        catch
        {
            return new List<TankerkoenigStation>();
        }
    }
}
