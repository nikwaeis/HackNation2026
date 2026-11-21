using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WodoPlon.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WaterCheckedAtAndReportJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "report_payload",
                table: "saved_reports",
                type: "json",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "jsonb");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "water_checked_at",
                table: "parcel_static_profiles",
                type: "timestamptz",
                nullable: true);

            // satellite data stored before the geo-worker contract and NDVI offset fixes is wrong (all null or NDVI ≈ 1):
            // mark it failed, ObservationService asks the geo-worker again on the next request
            migrationBuilder.Sql("""
                UPDATE dynamic_observations
                SET satellite_status = 'Error', ndvi_mean = NULL, ndwi_mean = NULL,
                    satellite_scene_date = NULL, cloud_cover_pct = NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "water_checked_at",
                table: "parcel_static_profiles");

            migrationBuilder.AlterColumn<string>(
                name: "report_payload",
                table: "saved_reports",
                type: "jsonb",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "json");
        }
    }
}
