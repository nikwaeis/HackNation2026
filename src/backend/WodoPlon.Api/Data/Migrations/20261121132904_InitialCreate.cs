using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace WodoPlon.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,")
                .Annotation("Npgsql:PostgresExtension:postgis", ",,");

            migrationBuilder.CreateTable(
                name: "crops",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    name_pl = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    kc_initial = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: false),
                    kc_mid = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: false),
                    kc_late = table.Column<decimal>(type: "numeric(4,2)", precision: 4, scale: 2, nullable: false),
                    critical_months = table.Column<int[]>(type: "integer[]", nullable: false),
                    root_depth_cm = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crops", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "hydro_features",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    feature_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    geom = table.Column<Geometry>(type: "geometry(Geometry,4326)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hydro_features", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "parcels",
                columns: table => new
                {
                    dzialka_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    voivodeship = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    area_ha = table.Column<decimal>(type: "numeric(10,4)", precision: 10, scale: 4, nullable: false),
                    centroid = table.Column<Point>(type: "geometry(Point,4326)", nullable: false),
                    geom = table.Column<MultiPolygon>(type: "geometry(MultiPolygon,4326)", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_parcels", x => x.dzialka_id);
                });

            migrationBuilder.CreateTable(
                name: "dynamic_observations",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    dzialka_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    target_date = table.Column<DateOnly>(type: "date", nullable: false),
                    precip_30d_mm = table.Column<decimal>(type: "numeric(7,2)", precision: 7, scale: 2, nullable: true),
                    precip_90d_mm = table.Column<decimal>(type: "numeric(7,2)", precision: 7, scale: 2, nullable: true),
                    precip_10yr_avg_90d_mm = table.Column<decimal>(type: "numeric(7,2)", precision: 7, scale: 2, nullable: true),
                    et0_90d_mm = table.Column<decimal>(type: "numeric(7,2)", precision: 7, scale: 2, nullable: true),
                    dry_spell_days = table.Column<int>(type: "integer", nullable: true),
                    historical_drought_years = table.Column<int>(type: "integer", nullable: true),
                    ndvi_mean = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: true),
                    ndwi_mean = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: true),
                    satellite_scene_date = table.Column<DateOnly>(type: "date", nullable: true),
                    cloud_cover_pct = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    satellite_status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_dynamic_observations", x => x.id);
                    table.ForeignKey(
                        name: "FK_dynamic_observations_parcels_dzialka_id",
                        column: x => x.dzialka_id,
                        principalTable: "parcels",
                        principalColumn: "dzialka_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "parcel_static_profiles",
                columns: table => new
                {
                    dzialka_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    mean_slope_deg = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    max_slope_deg = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    steep_area_pct = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    sand_pct = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    clay_pct = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    silt_pct = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    organic_carbon_g_kg = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    awc_mm_per_m = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    soil_drought_vulnerability = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    nearest_water_dist_m = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                    nearest_water_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_parcel_static_profiles", x => x.dzialka_id);
                    table.ForeignKey(
                        name: "FK_parcel_static_profiles_parcels_dzialka_id",
                        column: x => x.dzialka_id,
                        principalTable: "parcels",
                        principalColumn: "dzialka_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "saved_reports",
                columns: table => new
                {
                    report_uuid = table.Column<Guid>(type: "uuid", nullable: false),
                    dzialka_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    crop_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    target_date = table.Column<DateOnly>(type: "date", nullable: false),
                    water_deficit_level = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    report_payload = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_saved_reports", x => x.report_uuid);
                    table.ForeignKey(
                        name: "FK_saved_reports_crops_crop_id",
                        column: x => x.crop_id,
                        principalTable: "crops",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_saved_reports_parcels_dzialka_id",
                        column: x => x.dzialka_id,
                        principalTable: "parcels",
                        principalColumn: "dzialka_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ux_dynamic_observations_dzialka_id_target_date",
                table: "dynamic_observations",
                columns: new[] { "dzialka_id", "target_date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_hydro_features_geom",
                table: "hydro_features",
                column: "geom")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "ix_parcels_geom",
                table: "parcels",
                column: "geom")
                .Annotation("Npgsql:IndexMethod", "gist");

            migrationBuilder.CreateIndex(
                name: "IX_saved_reports_crop_id",
                table: "saved_reports",
                column: "crop_id");

            migrationBuilder.CreateIndex(
                name: "IX_saved_reports_dzialka_id",
                table: "saved_reports",
                column: "dzialka_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "dynamic_observations");

            migrationBuilder.DropTable(
                name: "hydro_features");

            migrationBuilder.DropTable(
                name: "parcel_static_profiles");

            migrationBuilder.DropTable(
                name: "saved_reports");

            migrationBuilder.DropTable(
                name: "crops");

            migrationBuilder.DropTable(
                name: "parcels");
        }
    }
}
