<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, ref, computed, shallowRef } from 'vue'
import type { DivIcon, Icon, LatLng, LatLngBoundsExpression, LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet'

type Player = {
  userId: string
  name: string
  level?: number
  location_x: number
  location_y: number
  ping?: number
}

type MapObject = {
  x: number
  y: number
  type: string
  localized_name?: string
  pal?: string
  pal_type?: string
}

const props = defineProps<{
  players: Player[]
  mapObjects?: MapObject[]
  serverName?: string
}>()

const typeLabelMap = {
  pal: 'Pal',
  alpha_pal: 'Alpha Pal',
  predator_pal: 'Predator Pal',
  dungeon: 'Dungeon',
  fast_travel: 'Fast Travel'
}

const leaflet = shallowRef<any>(null)
const map = shallowRef<LeafletMap | null>(null)
const playersLayer = shallowRef<any>(null)
const containerEl = ref<HTMLDivElement | null>(null)
const coordsDisplay = ref('0,0')
const activeTypes = ref<Set<string>>(new Set())

let playerMarkers: Marker[] = []
let objectMarkers: Marker[] = []
const playerMarkerByUserId = new Map<string, Marker>()

const availableTypes = computed(() =>
  Array.from(new Set((props.mapObjects || []).map((item) => item.type))).sort()
)

const sortedPlayers = computed(() => {
  return [...(props.players || [])].sort((a, b) => a.name.localeCompare(b.name))
})

function normalizePalImageName(pal: string) {
  return pal.trim().toLowerCase()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getObjectIconSrc(mapObject: MapObject) {
  if (mapObject.type === 'dungeon') return '/images/t_icon_compass_dungeon.webp'
  if (mapObject.type === 'fast_travel') return '/images/t_icon_compass_fttower.webp'

  // For pal-based objects, use the pal icon if we have one.
  if ((mapObject.type === 'pal' || mapObject.type === 'alpha_pal' || mapObject.type === 'predator_pal') && mapObject.pal) {
    return `/images/pals/${normalizePalImageName(mapObject.pal)}.webp`
  }

  return null
}

function getMapObjectKey(mapObject: MapObject) {
  return `${mapObject.type}:${mapObject.x}:${mapObject.y}:${mapObject.pal || ''}:${mapObject.localized_name || ''}`
}

// --- Leaflet coordinate conversion (provided) ---
const WORLD_MIN_X = -999940.0
const WORLD_MIN_Y = -738920.0
const WORLD_MAX_X = 447900.0
const WORLD_MAX_Y = 708920.0

// const TRANSLATION_X = 123930.0
// const TRANSLATION_Y = 157935.0
const TRANSLATION_X = 123930.0
const TRANSLATION_Y = 157935.0

const SCALE = 459.0
const MAP_SIZE = 8192

const GAME_MIN_X = -1951
const GAME_MIN_Y = -1893
const GAME_MAX_X = 1198
const GAME_MAX_Y = 1243

const ORIGIN_GAME_X = 0
const ORIGIN_GAME_Y = 0

const MAP_WIDTH = GAME_MAX_X - GAME_MIN_X
const MAP_HEIGHT = GAME_MAX_Y - GAME_MIN_Y

const TRANSFORM_A = MAP_SIZE / MAP_WIDTH
const TRANSFORM_B = 5075.45
const TRANSFORM_C = -MAP_SIZE / MAP_HEIGHT
const TRANSFORM_D = 4960.62

function worldToMap(worldX: number, worldY: number): { x: number; y: number } {
  const mapX = Math.round((worldY - TRANSLATION_Y) / SCALE)
  const mapY = Math.round((worldX + TRANSLATION_X) / SCALE) * -1
  return { x: mapX, y: mapY }
}

function mapToWorld(mapX: number, mapY: number): { x: number; y: number } {
  const worldX = mapY * -1 * SCALE - TRANSLATION_X
  const worldY = mapX * SCALE + TRANSLATION_Y
  return { x: worldX, y: worldY }
}

function worldToLeaflet(worldX: number, worldY: number): LatLng {
  const L = leaflet.value
  if (!L) throw new Error('Leaflet not initialized')
  const mapCoords = worldToMap(worldX, worldY)
  const leafletX = TRANSFORM_A * mapCoords.x + TRANSFORM_B
  const leafletY = TRANSFORM_C * mapCoords.y + TRANSFORM_D
  return L.latLng(leafletY, leafletX)
}

function leafletToWorld(latlng: LatLng): { worldX: number; worldY: number } {
  const gameX = (latlng.lng - TRANSFORM_B) / TRANSFORM_A
  const gameY = (latlng.lat - TRANSFORM_D) / TRANSFORM_C
  const worldCoords = mapToWorld(gameX, gameY)
  return { worldX: worldCoords.x, worldY: worldCoords.y }
}

function svgCircleIcon(color: string, sizePx: number, borderColor = '#ffffff', borderWidth = 2): Icon {
  const L = leaflet.value
  if (!L) throw new Error('Leaflet not initialized')
  const r = Math.max(1, Math.floor(sizePx / 2) - borderWidth)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}">
    <circle cx="${sizePx / 2}" cy="${sizePx / 2}" r="${r}" fill="${color}" stroke="${borderColor}" stroke-width="${borderWidth}" />
  </svg>`
  const iconUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return L.icon({
    iconUrl,
    iconSize: [sizePx, sizePx],
    iconAnchor: [sizePx / 2, sizePx / 2],
    popupAnchor: [0, -sizePx / 2]
  })
}

function getPlayerIcon(player: Player): DivIcon {
  const L = leaflet.value
  if (!L) throw new Error('Leaflet not initialized')

  const safeName = escapeHtml(player.name)
  const safeLevel = escapeHtml(`Lv ${player.level ?? '?'}`)

  // Uses existing CSS hooks in `app/assets/css/main.css`:
  // - `.leaflet-div-icon.player-leaflet-icon`
  // - `.player-marker-stack` (layout box)
  // - `.player-marker-dot` (the dot)
  // - `.player-marker-label` (label above the dot)
  const html = `
    <div class="player-marker-stack">
      <div class="player-marker-label">
        <div class="player-marker-name">${safeName}</div>
        <div class="player-marker-level">${safeLevel}</div>
      </div>
      <div class="player-marker-dot"></div>
    </div>
  `

  return L.divIcon({
    className: 'player-leaflet-icon',
    html,
    // Give the icon a real box so the label area is still clickable (opens popup).
    iconSize: [160, 54],
    iconAnchor: [80, 48],
    popupAnchor: [0, -48]
  })
}

function getObjectLabel(mapObject: MapObject) {
  if (mapObject.localized_name) return mapObject.localized_name
  if (mapObject.pal) return mapObject.pal
  return mapObject.type
}

function getObjectIcon(item: MapObject): Icon {
  const L = leaflet.value
  if (!L) throw new Error('Leaflet not initialized')

  const iconSrc = getObjectIconSrc(item)
  if (!iconSrc) return svgCircleIcon('#4ade80', 14)

  const size = (item.type === 'dungeon' || item.type === 'fast_travel') ? 32 : 40
  return L.icon({
    iconUrl: iconSrc,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  })
}

function updateObjectVisibility() {
  const m = map.value
  if (!m) return

  // Show/hide markers based on activeTypes (add/remove from map)
  for (const marker of objectMarkers) {
    const type = (marker as any)?.options?.title as string | undefined
    const shouldShow = !!type && activeTypes.value.has(type)
    const onMap = m.hasLayer(marker)
    if (shouldShow && !onMap) marker.addTo(m)
    if (!shouldShow && onMap) m.removeLayer(marker)
  }
}

function redrawMapObjects() {
  const L = leaflet.value
  const m = map.value
  if (!L || !m) return

  // Clear existing object markers
  objectMarkers.forEach((marker) => m.removeLayer(marker))
  objectMarkers = []

  const objects = props.mapObjects || []
  for (const item of objects) {
    const icon = getObjectIcon(item)
    const latlng = worldToLeaflet(item.x, item.y)

    // We store type in marker.options.title so updateObjectVisibility can toggle quickly.
    const marker = L.marker(latlng, { icon, title: item.type, className: 'textHelper' })

    const label = getObjectLabel(item)
    const mapCoords = worldToMap(item.x, item.y)
    marker.bindPopup(`
      <div>
        <h3 class="text-lg font-bold">${label}</h3>
        <p class="text-xs">${typeLabelMap[item.type as keyof typeof typeLabelMap] ?? item.type}</p>
        <p class="text-xs mt-2">World Coords: ${item.x.toFixed(2)}, ${item.y.toFixed(2)}</p>
        <p class="text-xs">Map Coords: ${mapCoords.x}, ${mapCoords.y * -1}</p>
      </div>
    `)

    if (activeTypes.value.has(item.type)) marker.addTo(m)
    objectMarkers.push(marker)
  }
}

function redrawPlayers() {
  const L = leaflet.value
  const m = map.value
  if (!L || !m) return

  // Do NOT clear the existing player layer; update markers in-place so focusing doesn't reset them.
  const layer = playersLayer.value ?? m

  const nextUserIds = new Set<string>()
  for (const player of props.players || []) {
    nextUserIds.add(player.userId)

    const ping = player.ping?.toFixed(2)
    const icon = getPlayerIcon(player)
    const latlng = worldToLeaflet(player.location_x, player.location_y)
    const mapCoords = worldToMap(player.location_x, player.location_y)
    const popupHtml = `
      <div>
        <h3 class="text-lg font-bold">${player.name}</h3>
        <p class="text-xs">Level: ${player.level ?? '?'}</p>
        ${ping ? `<p class="text-xs">Ping: ${ping}ms</p>` : ''}
        <p class="text-xs mt-2">World Coords: ${player.location_x.toFixed(2)}, ${player.location_y.toFixed(2)}</p>
        <p class="text-xs">Map Coords: ${mapCoords.x}, ${mapCoords.y * -1}</p>
      </div>
    `

    const existing = playerMarkerByUserId.get(player.userId)
    if (existing) {
      existing.setLatLng(latlng)
      ;(existing as any).setIcon?.(icon)
      existing.bindPopup(popupHtml)
      if (!m.hasLayer(existing)) existing.addTo(layer)
      continue
    }

    const marker = L.marker(latlng, { icon }).addTo(layer)
    marker.bindPopup(popupHtml)
    playerMarkerByUserId.set(player.userId, marker)
  }

  // Remove markers for players that no longer exist
  for (const [userId, marker] of playerMarkerByUserId.entries()) {
    if (nextUserIds.has(userId)) continue
    if (m.hasLayer(marker)) m.removeLayer(marker)
    playerMarkerByUserId.delete(userId)
  }

  // Keep this array in sync for any other codepaths that rely on it.
  playerMarkers = Array.from(playerMarkerByUserId.values())
}

function focusPlayer(player: Player) {
  const m = map.value
  if (!m) return

  const marker = playerMarkerByUserId.get(player.userId)
  const latlng = marker ? marker.getLatLng() : worldToLeaflet(player.location_x, player.location_y)
  const nextZoom = Math.max(m.getZoom(), -1)

  if (typeof (m as any).flyTo === 'function') {
    ;(m as any).flyTo(latlng, nextZoom, { animate: true, duration: 0.6 })
  } else {
    m.setView(latlng, nextZoom, { animate: true })
  }
}

function toggleType(type: string, checked: boolean) {
  const next = new Set(activeTypes.value)
  if (checked) {
    next.add(type)
  } else {
    next.delete(type)
  }
  activeTypes.value = next
}

function isTypeActive(type: string) {
  return activeTypes.value.has(type)
}

function handleTypeChange(type: string, event: Event) {
  const target = event.target as HTMLInputElement | null
  toggleType(type, !!target?.checked)
}

onMounted(async () => {
  const mod = await import('leaflet')
  const L = (mod as any).default ?? (mod as any)
  leaflet.value = L
  const container = containerEl.value
  if (!container) return

  // Custom CRS with corrected transformation
  const CustomCRS = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(TRANSFORM_A, TRANSFORM_B, TRANSFORM_C, TRANSFORM_D)
  })

  const bounds: LatLngBoundsExpression = [
    [0, 0],
    [MAP_SIZE, MAP_SIZE]
  ]

  // Initial view centered on game origin
  const worldCoords = mapToWorld(ORIGIN_GAME_X, ORIGIN_GAME_Y)
  const origin = worldToLeaflet(worldCoords.x, worldCoords.y)

  map.value = L.map(container, {
    crs: CustomCRS,
    zoomControl: false,
    minZoom: -4,
    maxZoom: 3,
    maxBounds: bounds,
    maxBoundsViscosity: 1
  })
  
  
  L.control.zoom({
      position: 'topright'
  }).addTo(map.value);

  const m = map.value
  if (!m) return

  L.imageOverlay('/worldmap.webp', bounds).addTo(m)
  m.fitBounds(bounds)
  m.setView([origin.lat, origin.lng], -3)

  playersLayer.value = L.layerGroup().addTo(m)

  m.on('mousemove', (e: LeafletMouseEvent) => {
    const world = leafletToWorld(e.latlng)
    const game = worldToMap(world.worldX, world.worldY)
    coordsDisplay.value = `${Math.round(game.x)},${Math.round(game.y * -1)}`
  })

  redrawMapObjects()
  redrawPlayers()
})

watch(
  () => props.players,
  () => {
    redrawPlayers()
  },
  { deep: true }
)

watch(
  () => props.mapObjects,
  (objects) => {
    const types = new Set((objects || []).map((item) => item.type))
    if (activeTypes.value.size === 0 && types.size > 0) {
      activeTypes.value = new Set(types)
    } else {
      const next = new Set(Array.from(activeTypes.value).filter((type) => types.has(type)))
      activeTypes.value = next
    }
    redrawMapObjects()
  },
  { deep: true, immediate: true }
)

watch(
  () => activeTypes.value,
  () => {
    updateObjectVisibility()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (map.value) {
    map.value.remove()
    map.value = null
  }
  playersLayer.value = null
  playerMarkers = []
  objectMarkers = []
  playerMarkerByUserId.clear()
})
</script>

<template>
  <div class="position-relative">
    <div class="textHelper connect-to-server-btn">
      <div>{{ serverName || 'Loading...' }}</div>
      <div v-if="availableTypes.length" class="object-filters">
        <label v-for="type in availableTypes" :key="type" class="filter-option">
          <input
            type="checkbox"
            :checked="isTypeActive(type)"
            @change="handleTypeChange(type, $event)"
          >
          <span>{{ typeLabelMap[type as keyof typeof typeLabelMap] ?? type }}</span>
        </label>
      </div>
      <div v-if="sortedPlayers.length" class="player-list">
        <div class="player-list-title">Players</div>
        <ul class="player-list-items">
          <li v-for="player in sortedPlayers" :key="player.userId" class="player-list-item">
            <button
              type="button"
              class="player-focus-btn"
              title="Focus on player"
              @click="focusPlayer(player)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  fill="currentColor"
                  d="M11 3a1 1 0 0 1 2 0v2.06A7.002 7.002 0 0 1 18.94 11H21a1 1 0 1 1 0 2h-2.06A7.002 7.002 0 0 1 13 18.94V21a1 1 0 1 1-2 0v-2.06A7.002 7.002 0 0 1 5.06 13H3a1 1 0 1 1 0-2h2.06A7.002 7.002 0 0 1 11 5.06V3zm1 4a5 5 0 1 0 0 10a5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4a2 2 0 0 1 0-4z"
                />
              </svg>
            </button>
            <span class="player-name" :title="player.userId">{{ player.name }}</span>
            <span v-if="player.level != null" class="player-level">Lv {{ player.level }}</span>
          </li>
        </ul>
      </div>
    </div>
    <div class="info">
      <a href="https://github.com/brantje/palserver-map" target="_blank">palserver map</a>
    </div>
    <div id="cursorViewportPosition">{{ coordsDisplay }}</div>
    <div ref="containerEl" id="leaflet-map"></div>
  </div>
</template>
