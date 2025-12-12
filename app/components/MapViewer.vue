<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch, ref, computed } from 'vue'


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

const viewer = shallowRef<any>(null)
const osdLib = shallowRef<any>(null)
const containerEl = ref<HTMLDivElement | null>(null)
const coordsDisplay = ref('0,0')
let mouseTracker: any
const isReady = ref(false)
const activeTypes = ref<Set<string>>(new Set())

let playerOverlayEls: HTMLElement[] = []
let objectOverlayByKey = new Map<string, HTMLElement>()

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

function toViewportCoords(xLoc: number, yLoc: number, imageSize: any) {
  const viewportX = ((xLoc + 1000) / 2000) * imageSize.x
  const viewportY = ((1000 - yLoc) / 2000) * imageSize.y
  return { viewportX, viewportY }
}

function mapWorldToViewportCoords(worldX: number, worldY: number, imageSize: any) {
  const xLoc = (worldY - 156844.55791065) / 462.962962963
  const yLoc = (worldX + 121467.1611767) / 462.962962963
  return toViewportCoords(xLoc, yLoc, imageSize)
}

function getImageSize() {
  return viewer.value?.source?.dimensions
}

function clearPlayerOverlays() {
  if (!viewer.value || playerOverlayEls.length === 0) return
  playerOverlayEls.forEach((el) => viewer.value.removeOverlay(el))
  playerOverlayEls = []
}

function drawPlayers(imageSize: any) {
  if (!viewer.value || !viewer.value.source || !props.players || !osdLib.value) return

  props.players.forEach((player) => {
    const { viewportX, viewportY } = mapWorldToViewportCoords(
      player.location_x,
      player.location_y,
      imageSize
    )
    const location = viewer.value.viewport.imageToViewportCoordinates(viewportX, viewportY)
    const dot = document.createElement('div')
    dot.className = 'test-overlay'

    const ping = player.ping?.toFixed(2)
    const label = document.createElement('div')
    label.className = 'player-label'
    label.innerHTML = `<span>Lv.${player.level ?? '?'}</span> <span>${player.name}</span>${
      ping ? `<span class="ping-label">Ping: ${ping}ms</span>` : ''
    }`
    dot.appendChild(label)

    viewer.value.addOverlay({
      element: dot,
      location,
      checkResize: false,
      placement: osdLib.value.Placement.CENTER
    })

    playerOverlayEls.push(dot)
  })
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
  if (!isReady.value) return
  objectOverlayByKey.forEach((el) => {
    const type = el.dataset.type
    const shouldShow = !!type && activeTypes.value.has(type)
    el.classList.toggle('map-object-hidden', !shouldShow)
  })
}

function syncMapObjectOverlays() {
  if (!viewer.value || !osdLib.value || !isReady.value) return
  const imageSize = getImageSize()
  if (!imageSize) return

  const objects = props.mapObjects || []
  const nextKeys = new Set<string>()

  for (const item of objects) {
    const key = getMapObjectKey(item)
    nextKeys.add(key)

    if (objectOverlayByKey.has(key)) continue

    const { viewportX, viewportY } = mapWorldToViewportCoords(item.x, item.y, imageSize)
    const location = viewer.value.viewport.imageToViewportCoordinates(viewportX, viewportY)
    const overlay = createMapObjectOverlayElement(item)

    viewer.value.addOverlay({
      element: overlay,
      location,
      checkResize: false,
      placement: osdLib.value.Placement.CENTER
    })

    objectOverlayByKey.set(key, overlay)
  }

  // Remove stale overlays (objects removed from the dataset)
  for (const [key, el] of objectOverlayByKey.entries()) {
    if (nextKeys.has(key)) continue
    viewer.value.removeOverlay(el)
    objectOverlayByKey.delete(key)
  }

  updateObjectVisibility()
}

function redrawPlayers() {
  if (!viewer.value || !osdLib.value || !isReady.value) return
  const imageSize = getImageSize()
  if (!imageSize) return
  clearPlayerOverlays()
  drawPlayers(imageSize)
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
  const { default: OpenSeadragon } = await import('openseadragon')
  const Annotorious = (await import('@recogito/annotorious-openseadragon')).default
  osdLib.value = OpenSeadragon
  const container = containerEl.value
  if (!container) return

  viewer.value = OpenSeadragon({
    showNavigationControl: false,
    showZoomControl: false,
    element: container,
    tileSources: [
      {
        type: 'image',
        url: '/worldmap.webp'
      }
    ],
    minZoomLevel: 1,
    maxZoomLevel: 10,
    visibilityRatio: 1.0,
    defaultZoomLevel: 3,
    constrainDuringPan: true,
    zoomPerClick: 1
  })

  Annotorious(viewer.value, {
    disableEditor: true,
    allowEmpty: true
  })

  viewer.value.addOnceHandler('open', () => {
    isReady.value = true
    syncMapObjectOverlays()
    redrawPlayers()
  })

  mouseTracker = new OpenSeadragon.MouseTracker({
    element: viewer.value.container,
    moveHandler: (event: any) => {
      const viewerX = event.position.x
      const viewerY = event.position.y
      const windowPoint = new OpenSeadragon.Point(viewerX, viewerY)
      const viewportPoint =
        viewer.value.viewport.windowToImageCoordinates(windowPoint)
      const imageSize = viewer.value.source.dimensions

      const mappedX = (viewportPoint.x / imageSize.x) * 2000 - 1000
      const mappedY =
        ((imageSize.y - viewportPoint.y) / imageSize.y) * 2000 - 1000

      coordsDisplay.value = `${Math.round(mappedX)},${Math.round(mappedY)}`
    }
  })

  mouseTracker.setTracking(true)
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
    syncMapObjectOverlays()
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
  mouseTracker?.destroy?.()
  if (viewer.value) {
    viewer.value.destroy()
    viewer.value = null
  }
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
    <div ref="containerEl" id="openseadragon"></div>
  </div>
</template>
