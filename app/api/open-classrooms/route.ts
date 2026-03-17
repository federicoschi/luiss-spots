import { NextResponse } from "next/server";

const LUISS_API_URL =
    "https://pianificazionespazi.luiss.it/PortaleStudentiLuiss/rooms_call.php";
const LUISS_CAMPUS_COORDS: [number, number] = [12.493749195952972, 41.92433595438564]; // [lng, lat]
const DAY_START = "08:00:00";
const DAY_END = "23:45:00";
const UPCOMING_THRESHOLD_MINUTES = 20;

interface LuissRoom {
    nome: string;
    sede: string;
    codice_sede: string;
}

interface LuissEvent {
    id: string;
    from: string;
    to: string;
    NomeAula: string;
    CodiceAula: string;
    NomeSede: string;
    CodiceSede: string;
    Giorno: string;
    name: string;
    name_original: string;
    utenti: string;
    type: string;
    orario: string;
    Annullato: string;
}

interface LuissApiResponse {
    rooms: Record<string, LuissRoom>;
    events: LuissEvent[];
    fasce: { label: string; valore: number }[];
}

interface Slot {
    StartTime: string;
    EndTime: string;
    Status: string;
}

interface BuildingData {
    building: string;
    building_code: string;
    building_status: string;
    rooms: Record<string, { name: string; slots: Slot[] }>;
    coords: [number, number];
    distance: number;
}

// Floor grouping configuration with per-group coordinates [lng, lat]
const FLOOR_GROUPS: Record<string, { name: string; order: number; coords: [number, number] }> = {
    dome: { name: "The Dome & Special", order: 0, coords: [12.494192579231878, 41.92428277776611] },
    ground: { name: "Piano Terra", order: 1, coords: LUISS_CAMPUS_COORDS },
    "1": { name: "1° Piano", order: 2, coords: LUISS_CAMPUS_COORDS },
    "2": { name: "2° Piano", order: 3, coords: LUISS_CAMPUS_COORDS },
    "3": { name: "3° Piano", order: 4, coords: LUISS_CAMPUS_COORDS },
    "4": { name: "4° Piano", order: 5, coords: LUISS_CAMPUS_COORDS },
};

function getRoomFloor(code: string): string {
    if (code.startsWith("D") || code === "RPol" || code === "RLou") return "dome";
    if (code.startsWith("TD") || code.startsWith("RT")) return "ground";

    const match = code.match(/^R(\d)/);
    if (match) return match[1];
    return "ground";
}

function timeToMinutes(time: string): number {
    const parts = time.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60)
        .toString()
        .padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    return `${h}:${m}:00`;
}

function getSlotStatus(
    currentMinutes: number,
    startMinutes: number,
    endMinutes: number
): string {
    if (currentMinutes >= endMinutes) return "passed";
    if (currentMinutes >= startMinutes && currentMinutes < endMinutes)
        return "available";
    const minutesUntilStart = startMinutes - currentMinutes;
    if (minutesUntilStart > 0 && minutesUntilStart < UPCOMING_THRESHOLD_MINUTES)
        return "upcoming";
    return "unavailable";
}

function haversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function computeFreeSlots(
    events: LuissEvent[],
    currentMinutes: number
): Slot[] {
    const dayStartMin = timeToMinutes(DAY_START);
    const dayEndMin = timeToMinutes(DAY_END);

    // Sort events by start time and merge overlapping
    const sorted = events
        .filter((e) => e.Annullato !== "1")
        .map((e) => ({
            start: Math.max(timeToMinutes(e.from), dayStartMin),
            end: Math.min(timeToMinutes(e.to), dayEndMin),
        }))
        .sort((a, b) => a.start - b.start);

    // Merge overlapping intervals
    const merged: { start: number; end: number }[] = [];
    for (const interval of sorted) {
        if (interval.start >= interval.end) continue;
        if (merged.length > 0 && interval.start <= merged[merged.length - 1].end) {
            merged[merged.length - 1].end = Math.max(
                merged[merged.length - 1].end,
                interval.end
            );
        } else {
            merged.push({ ...interval });
        }
    }

    // Find gaps (free slots)
    const freeSlots: Slot[] = [];
    let cursor = dayStartMin;

    for (const occupied of merged) {
        if (cursor < occupied.start) {
            const status = getSlotStatus(currentMinutes, cursor, occupied.start);
            if (status !== "passed") {
                freeSlots.push({
                    StartTime: minutesToTime(cursor),
                    EndTime: minutesToTime(occupied.start),
                    Status: status,
                });
            }
        }
        cursor = Math.max(cursor, occupied.end);
    }

    // Remaining time after last event
    if (cursor < dayEndMin) {
        const status = getSlotStatus(currentMinutes, cursor, dayEndMin);
        if (status !== "passed") {
            freeSlots.push({
                StartTime: minutesToTime(cursor),
                EndTime: minutesToTime(dayEndMin),
                Status: status,
            });
        }
    }

    return freeSlots;
}

function getTodayFormatted(): string {
    const now = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" })
    );
    const day = now.getDate().toString().padStart(2, "0");
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
}

function getCurrentMinutesRome(): number {
    const now = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" })
    );
    return now.getHours() * 60 + now.getMinutes();
}

async function fetchLuissData(): Promise<LuissApiResponse> {
    const today = getTodayFormatted();
    const response = await fetch(LUISS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `sede=LUISSRO&date=${today}`,
        cache: "no-cache",
    });

    if (!response.ok) {
        throw new Error(`LUISS API returned ${response.status}`);
    }

    return response.json();
}

function buildResponse(
    luissData: LuissApiResponse,
    userLat: number | null,
    userLng: number | null
): BuildingData[] {
    const { rooms, events } = luissData;
    const currentMinutes = getCurrentMinutesRome();

    // Group events by room code
    const eventsByRoom: Record<string, LuissEvent[]> = {};
    const eventList: LuissEvent[] = Array.isArray(events)
        ? events
        : Object.values(events as Record<string, LuissEvent>);
    for (const event of eventList) {
        const code = event.CodiceAula;
        if (!eventsByRoom[code]) eventsByRoom[code] = [];
        eventsByRoom[code].push(event);
    }

    // Compute free slots for each room and group by floor
    const floorRooms: Record<
        string,
        Record<string, { name: string; slots: Slot[] }>
    > = {};

    for (const [roomCode, roomInfo] of Object.entries(rooms)) {
        const roomEvents = eventsByRoom[roomCode] || [];
        const freeSlots = computeFreeSlots(roomEvents, currentMinutes);

        if (freeSlots.length === 0) continue;

        const floor = getRoomFloor(roomCode);
        if (!floorRooms[floor]) floorRooms[floor] = {};
        floorRooms[floor][roomCode] = {
            name: roomInfo.nome,
            slots: freeSlots,
        };
    }

    // Build building entries per floor
    const distance =
        userLat && userLng
            ? haversine(userLat, userLng, LUISS_CAMPUS_COORDS[1], LUISS_CAMPUS_COORDS[0])
            : 0;

    const buildings: BuildingData[] = [];

    for (const [floorKey, floorRoomMap] of Object.entries(floorRooms)) {
        const group = FLOOR_GROUPS[floorKey] || {
            name: `Floor ${floorKey}`,
            order: 99,
        };

        // Determine aggregate status
        let buildingStatus = "unavailable";
        for (const room of Object.values(floorRoomMap)) {
            for (const slot of room.slots) {
                if (slot.Status === "available") {
                    buildingStatus = "available";
                    break;
                }
                if (slot.Status === "upcoming" && buildingStatus !== "available") {
                    buildingStatus = "upcoming";
                }
            }
            if (buildingStatus === "available") break;
        }

        buildings.push({
            building: group.name,
            building_code: floorKey,
            building_status: buildingStatus,
            rooms: floorRoomMap,
            coords: group.coords,
            distance,
        });
    }

    // Sort by floor order
    buildings.sort((a, b) => {
        const orderA = FLOOR_GROUPS[a.building_code]?.order ?? 99;
        const orderB = FLOOR_GROUPS[b.building_code]?.order ?? 99;
        return orderA - orderB;
    });

    return buildings;
}

export async function POST(req: Request) {
    try {
        const { lat, lng } = await req.json();
        const luissData = await fetchLuissData();
        const data = buildResponse(luissData, lat, lng);
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in POST route:", error);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        const luissData = await fetchLuissData();
        const data = buildResponse(luissData, null, null);
        return NextResponse.json(data);
    } catch (error) {
        console.error("Error in GET route:", error);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
