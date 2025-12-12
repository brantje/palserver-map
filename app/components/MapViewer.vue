<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch, ref, computed, shallowRef } from 'vue'
import type { LatLng, LatLngBoundsExpression, LayerGroup, LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet'

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
const containerEl = ref<HTMLDivElement | null>(null)
const coordsDisplay = ref('0,0')
const activeTypes = ref<Set<string>>(new Set())

let playersLayer: LayerGroup | null = null
const objectLayersByType = new Map<string, LayerGroup>()
const objectMarkerByKey = new Map<string, { marker: Marker; type: string }>()

const availableTypes = computed(() =>
  Array.from(new Set((props.mapObjects || []).map((item) => item.type))).sort()
)

function normalizePalImageName(pal: string) {
  return pal.trim().toLowerCase()
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

function ensureObjectLayer(type: string): LayerGroup | null {
  const L = leaflet.value
  const m = map.value
  if (!L || !m) return null

  let group = objectLayersByType.get(type)
  if (!group) {
    const created: LayerGroup = L.layerGroup()
    objectLayersByType.set(type, created)
    group = created
  }

  // Apply current visibility
  const shouldShow = activeTypes.value.has(type)
  const onMap = m.hasLayer(group)
  if (shouldShow && !onMap) group.addTo(m)
  if (!shouldShow && onMap) group.removeFrom(m)

  return group
}

function getObjectLabel(mapObject: MapObject) {
  if (mapObject.localized_name) return mapObject.localized_name
  if (mapObject.pal) return mapObject.pal
  return mapObject.type
}

function createMapObjectOverlayElement(item: MapObject) {
  const overlay = document.createElement('div')
  overlay.className = 'map-object-overlay'
  overlay.dataset.type = item.type

  const stack = document.createElement('div')
  stack.className = 'map-object-stack'

  const iconSrc = getObjectIconSrc(item)
  if (iconSrc) {
    const img = document.createElement('img')
    img.className = 'map-object-image'
    img.alt = item.type
    img.src = iconSrc
    img.loading = 'lazy'
    // Fallback to a simple marker if the image is missing.
    img.onerror = () => {
      img.remove()
      const marker = document.createElement('div')
      marker.className = 'map-object-marker'
      stack.prepend(marker)
    }
    stack.appendChild(img)
  } else {
    const marker = document.createElement('div')
    marker.className = 'map-object-marker'
    stack.appendChild(marker)
  }

  const label = document.createElement('div')
  label.className = `map-object-label map-object-label-${item.type}`
  label.textContent = `${getObjectLabel(item)}`
  stack.appendChild(label)

  overlay.appendChild(stack)
  return overlay
}

function updateObjectVisibility() {
  const m = map.value
  if (!m) return

  for (const [type, group] of objectLayersByType.entries()) {
    const shouldShow = activeTypes.value.has(type)
    const onMap = m.hasLayer(group)
    if (shouldShow && !onMap) group.addTo(m)
    if (!shouldShow && onMap) group.removeFrom(m)
  }
}

function syncMapObjectMarkers() {
  const L = leaflet.value
  const m = map.value
  if (!L || !m) return
  const objects = props.mapObjects || []
  const nextKeys = new Set<string>()

  for (const item of objects) {
    const key = getMapObjectKey(item)
    nextKeys.add(key)

    if (objectMarkerByKey.has(key)) continue

    const overlay = createMapObjectOverlayElement(item)
    const icon = L.divIcon({
      className: 'map-object-leaflet-icon',
      html: overlay.outerHTML,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    })

    const latlng = worldToLeaflet(item.x, item.y)
    const marker = L.marker(latlng, { icon })

    const group = ensureObjectLayer(item.type)
    if (group) marker.addTo(group)

    objectMarkerByKey.set(key, { marker, type: item.type })
  }

  // Remove stale markers (objects removed from the dataset)
  for (const [key, entry] of objectMarkerByKey.entries()) {
    if (nextKeys.has(key)) continue
    const group = objectLayersByType.get(entry.type)
    if (group) group.removeLayer(entry.marker)
    entry.marker.remove()
    objectMarkerByKey.delete(key)
  }

  updateObjectVisibility()
}

function redrawPlayers() {
  const L = leaflet.value
  const m = map.value
  if (!L || !m || !playersLayer) return

  playersLayer.clearLayers()

  for (const player of props.players || []) {
    const ping = player.ping?.toFixed(2)
    const html = `
      <div class="test-overlay">
        <div class="player-label">
          <span>Lv.${player.level ?? '?'}</span>
          <span>${player.name}</span>
          ${ping ? `<span class="ping-label">Ping: ${ping}ms</span>` : ''}
        </div>
      </div>
    `

    const icon = L.divIcon({
      className: 'player-leaflet-icon',
      html,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    })

    const latlng = worldToLeaflet(player.location_x, player.location_y)
    L.marker(latlng, { icon }).addTo(playersLayer)
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

  const m = map.value
  if (!m) return

  L.imageOverlay('/worldmap.webp', bounds).addTo(m)
  m.fitBounds(bounds)
  m.setView([origin.lat, origin.lng], -3)

  playersLayer = L.layerGroup().addTo(m)

  m.on('mousemove', (e: LeafletMouseEvent) => {
    const world = leafletToWorld(e.latlng)
    const game = worldToMap(world.worldX, world.worldY)
    coordsDisplay.value = `${Math.round(game.x)},${Math.round(game.y * -1)}`
  })

  syncMapObjectMarkers()
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
    syncMapObjectMarkers()
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
  playersLayer = null
  objectLayersByType.clear()
  objectMarkerByKey.clear()
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
          <span>{{ typeLabelMap[type as keyof typeof typeLabelMap] }}</span>
        </label>
      </div>
    </div>
    <div class="info">
      <a href="https://github.com/brantje/palserver-map" target="_blank">palserver map</a>
    </div>
    <div id="cursorViewportPosition">{{ coordsDisplay }}</div>
    <div ref="containerEl" id="leaflet-map"></div>
  </div>
</template>
