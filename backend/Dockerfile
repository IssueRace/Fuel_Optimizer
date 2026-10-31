# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["FuelOptimizer.Api.csproj", "./"]
RUN dotnet restore "FuelOptimizer.Api.csproj"

# Copy remaining source code and publish
COPY . .
RUN dotnet publish "FuelOptimizer.Api.csproj" -c Release -o /app/publish

# Final runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Expose port and run
ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "FuelOptimizer.Api.dll"]
