using Microsoft.AspNetCore.Mvc;
using FuelOptimizer.Api.Services;

namespace FuelOptimizer.Api.Controllers;

[ApiController]
[Route("api/fuel-prices")]
public class FuelPriceController : ControllerBase
{
    private readonly TankerkoenigService _tankerkoenigService;
    public FuelPriceController(TankerkoenigService tankerkoenigService)
    {
        _tankerkoenigService = tankerkoenigService;
    }

    [HttpGet("search")]
    public async Task<ActionResult> SearchNearby([FromQuery] double lat, [FromQuery] double lng, [FromQuery] double rad = 5, [FromQuery] string type = "all")
    {
        var stations = await _tankerkoenigService.SearchStationsAsync(lat, lng, rad, type);
        return Ok(new { count = stations.Count, stations });
    }
}
