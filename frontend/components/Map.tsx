"use client";
import React from "react";
import { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface dataFormat {
    building: string;
    building_code: string;
    building_status: string;
    rooms: {
        [key: string]: {
            name: string;
            slots: { StartTime: string; EndTime: string; Status: string }[];
        };
    };
    coords: [number, number];
    distance: number;
}

export default function Map({
    data = [],
    handleMarkerClick,
    userPos,
}: {
    data: dataFormat[];
    handleMarkerClick: (building: string) => void;
    userPos: [number, number] | null;
}) {
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);

    const [center, setCenter] = useState<[number, number]>([12.493749195952972, 41.92433595438564]);
    const [zoom, setZoom] = useState(17);
    const [pitch, setPitch] = useState(52);

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

    function getColorByStatus(status: string) {
        switch (status) {
            case "available":
                return "h-2 w-2 rounded-full bg-green-400 shadow-[0px_0px_4px_2px_rgba(34,197,94,0.7)]";
            case "unavailable":
                return "h-2 w-2 rounded-full bg-red-400 shadow-[0px_0px_4px_2px_rgba(239,68,68,0.9)]";
            case "upcoming":
                return "h-2 w-2 rounded-full bg-amber-400 shadow-[0px_0px_4px_2px_rgba(245,158,11,0.9)]";
            default:
                return "gray";
        }
    }

    useEffect(() => {
        if (mapboxToken) {
            mapboxgl.accessToken = mapboxToken;
        } else {
            console.error("Mapbox token is not defined");
        }
        mapRef.current = new mapboxgl.Map({
            style: "mapbox://styles/mapbox/dark-v11",
            container: mapContainerRef.current as HTMLElement,
            center: center,
            zoom: zoom,
            pitch: pitch,
        });

        mapRef.current.on("click", (e) => {
            console.log(`Clicked: ${e.lngLat.lat}, ${e.lngLat.lng}`);
        });

        mapRef.current.on("load", () => {
            const map = mapRef.current;
            if (!map) return;

            // Add 3D building extrusions
            const layers = map.getStyle().layers;
            // Find the first symbol layer to insert buildings below labels
            let labelLayerId: string | undefined;
            if (layers) {
                for (const layer of layers) {
                    if (layer.type === "symbol" && (layer.layout as Record<string, unknown>)?.["text-field"]) {
                        labelLayerId = layer.id;
                        break;
                    }
                }
            }

            map.addLayer(
                {
                    id: "3d-buildings",
                    source: "composite",
                    "source-layer": "building",
                    filter: ["==", "extrude", "true"],
                    type: "fill-extrusion",
                    minzoom: 14,
                    paint: {
                        "fill-extrusion-color": "#1e1e2e",
                        "fill-extrusion-height": [
                            "interpolate",
                            ["linear"],
                            ["zoom"],
                            14, 0,
                            14.5, ["get", "height"],
                        ],
                        "fill-extrusion-base": [
                            "interpolate",
                            ["linear"],
                            ["zoom"],
                            14, 0,
                            14.5, ["get", "min_height"],
                        ],
                        "fill-extrusion-opacity": 0.8,
                    },
                },
                labelLayerId
            );
        });

        mapRef.current.on("move", () => {
            if (mapRef.current) {
                const mapCenter = mapRef.current.getCenter();
                const mapZoom = mapRef.current.getZoom();
                const mapPitch = mapRef.current.getPitch();

                setCenter([mapCenter.lng, mapCenter.lat]);
                setZoom(mapZoom);
                setPitch(mapPitch);
            }
        });

        // Deduplicate markers by coordinates — one marker per physical building
        const markersByCoords: Record<string, { coords: [number, number]; status: string; codes: string[] }> = {};
        const statusPriority: Record<string, number> = { available: 2, upcoming: 1, unavailable: 0 };

        for (const entry of data) {
            const key = `${entry.coords[0]},${entry.coords[1]}`;
            const existing = markersByCoords[key];
            if (existing) {
                existing.codes.push(entry.building_code);
                if ((statusPriority[entry.building_status] ?? 0) > (statusPriority[existing.status] ?? 0)) {
                    existing.status = entry.building_status;
                }
            } else {
                markersByCoords[key] = {
                    coords: entry.coords,
                    status: entry.building_status,
                    codes: [entry.building_code],
                };
            }
        }

        for (const marker of Object.values(markersByCoords)) {
            const el = document.createElement("div");
            el.className = getColorByStatus(marker.status);

            el.addEventListener("click", () => {
                // Scroll to the first floor group for this building
                const firstCode = marker.codes[0];
                const accordionItem = document.getElementById(firstCode);

                setTimeout(() => {
                    if (accordionItem) {
                        accordionItem.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                        });
                    }
                }, 300);

                handleMarkerClick(firstCode);
            });

            if (mapRef.current) {
                new mapboxgl.Marker(el)
                    .setLngLat([marker.coords[0], marker.coords[1]])
                    .addTo(mapRef.current);
            }
        }

        if (userPos) {
            const e2 = document.createElement("div");
            e2.className =
                "h-3 w-3 border-[1.5px] border-zinc-50 rounded-full bg-blue-400 shadow-[0px_0px_4px_2px_rgba(14,165,233,1)]";

            new mapboxgl.Marker(e2)
                .setLngLat([userPos[1], userPos[0]])
                // .setLngLat([-80.5425, 43.4695])
                .addTo(mapRef.current);
        }

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
            }
        };
    }, []);

    return (
        <div className="h-[60vh] sm:w-full sm:h-full relative bg-red-500/0 rounded-[20px] p-2 sm:p-0">
            <div
                id="map-container"
                ref={mapContainerRef}
                className="opacity-100"
            />
            <div className="bg-[#18181b]/90 absolute bottom-10 left-2 sm:bottom-8 sm:left-0 flex flex-col gap-2 m-1 py-2.5 p-2 rounded-[16px]">
                <div className="flex items-center gap-0">
                    <div className="h-2 w-2 rounded-full bg-red-400 flex-none"></div>
                    <div className="ml-2 rounded-lg px-2 py-1 text-sm w-full bg-red-700/30 text-red-300/90">
                        unavailable
                    </div>
                </div>
                <div className="flex items-center gap-0">
                    <div className="h-2 w-2 rounded-full bg-amber-400 flex-none"></div>
                    <div className="ml-2 rounded-lg px-2 py-1 text-sm w-full bg-amber-800/30 text-amber-300/90">
                        opening soon
                    </div>
                </div>
                <div className="flex items-center gap-0">
                    <div className="h-2 w-2 rounded-full bg-green-400 flex-none"></div>
                    <div className="ml-2 rounded-lg px-2 py-1 text-sm w-full bg-green-800/30 text-green-300/90">
                        open now
                    </div>
                </div>
            </div>
        </div>
    );
}
