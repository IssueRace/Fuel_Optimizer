using Microsoft.EntityFrameworkCore;
using FuelOptimizer.Api.Models;

namespace FuelOptimizer.Api.Services;

public class FuelOptimizerContext : DbContext
{
    public FuelOptimizerContext(DbContextOptions<FuelOptimizerContext> options) : base(options) { }
    public DbSet<TripHistoryEntry> TripHistory { get; set; }
}
