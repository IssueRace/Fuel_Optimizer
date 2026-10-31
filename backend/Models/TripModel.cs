namespace FuelOptimizer.Api.Models;

public class TripRequest
{
    public string Origin { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public double FuelConsumption { get; set; }
    public double FuelTankCapacity { get; set; }
    public string FuelType { get; set; } = "Petrol";
    public double CurrentFuelPercent { get; set; } = 30;
}

public class FuelStop
{
    public string StationName { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double PricePerLiter { get; set; }
    public double AmountToRefuel { get; set; }
    public double DistanceAlongRouteKm { get; set; }
}

public class TripResponse
{
    public double TotalDistanceKm { get; set; }
    public double TotalCostEur { get; set; }
    public List<FuelStop> RecommendedStops { get; set; } = new();
    public List<double[]> RouteCoordinates { get; set; } = new();
    public List<double[]> UnreachableCoordinates { get; set; } = new();
    public bool IsPossible { get; set; } = true;
    public double StoppedAtKm { get; set; } = 0;
}

public class TripHistoryEntry
{
    public int Id { get; set; }
    public string Origin { get; set; } = string.Empty;
    public string Destination { get; set; } = string.Empty;
    public double DistanceKm { get; set; }
    public double TotalCostEur { get; set; }
    public int StopsCount { get; set; }
    public string FuelType { get; set; } = string.Empty;
    public string VehicleProfile { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
