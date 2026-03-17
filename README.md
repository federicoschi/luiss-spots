# Spots @ LUISS

**Spots** is a web application that helps students at LUISS Guido Carli find open classrooms for studying. When libraries and other common study areas are full, students can use Spots to locate available rooms in real-time at the Viale Romania campus.

Forked from [notAkki/spots](https://github.com/notAkki/open-classrooms), originally built for the University of Waterloo.

![alt text](SpotsDemoImage.png)

## Features

- Displays open classrooms in the LUISS Viale Romania campus in real-time (for now, might add pola & parenzo if needed).
- Rooms grouped by floor (Piano Terra, 1°-4° Piano, The Dome & Special).
- Color-coded availability status: green (open now), amber (opening soon), red (unavailable).
- Interactive 3D map centered on the LUISS campus.
- Computes free time slots by inverting the official class schedule.

## How It Works

1. The website scrapes today's room and event data from the LUISS EasyStaff API.
2. For each of the rooms, occupied time slots are merged and free gaps between 08:00-21:15 are computed.
3. Each free slot gets a status based on the current time (available, upcoming, unavailable, passed).
4. Rooms are grouped by floor and returned to the frontend for display.

## Tech Stack

- **Next.js 14**: Full-stack React framework — handles both the frontend UI and the API route that fetches/processes LUISS data.
- **Mapbox GL**: Interactive 3D map displaying the campus with building extrusions.
- **Tailwind CSS**: Utility-first styling with a dark theme.
- **Radix UI**: Accessible accordion and popover components.
- **LUISS EasyStaff API**: Public scheduling API providing room and event data.

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your Mapbox access token to .env

# Run development server
npm run dev
```

You need a [Mapbox access token](https://account.mapbox.com/) set as `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in your `.env` file.

## Contact

For questions or concerns about API usage: reports@federicoschi.systems
