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

const viewer = shallowRef<any>(null)
const osdLib = shallowRef<any>(null)
const containerEl = ref<HTMLDivElement | null>(null)
const coordsDisplay = ref('0,0')
let mouseTracker: any
const isReady = ref(false)
const activeTypes = ref<Set<string>>(new Set())

const availableTypes = computed(() =>
  Array.from(new Set((props.mapObjects || []).map((item) => item.type))).sort()
)

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
  })
}

function getObjectLabel(mapObject: MapObject) {
  if (mapObject.localized_name) return mapObject.localized_name
  if (mapObject.pal) return mapObject.pal
  return mapObject.type
}

function drawMapObjects(imageSize: any) {
  if (!viewer.value || !osdLib.value || !props.mapObjects?.length) return

  props.mapObjects
    .filter((item) => activeTypes.value.has(item.type))
    .forEach((item) => {
      const { viewportX, viewportY } = mapWorldToViewportCoords(item.x, item.y, imageSize)
      const location = viewer.value.viewport.imageToViewportCoordinates(viewportX, viewportY)
      const dot = document.createElement('div')
      dot.className = 'map-object-overlay'
      dot.dataset.type = item.type

      const label = document.createElement('div')
      label.className = 'map-object-label'
      label.textContent = `${getObjectLabel(item)} (${item.type})`
      dot.appendChild(label)

      viewer.value.addOverlay({
        element: dot,
        location,
        checkResize: false,
        placement: osdLib.value.Placement.CENTER
      })
    })
}

function drawAllOverlays() {
  if (!viewer.value || !viewer.value.source || !osdLib.value || !isReady.value) return
  const imageSize = viewer.value.source?.dimensions
  if (!imageSize) return
  viewer.value.clearOverlays()
  drawMapObjects(imageSize)
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
        url: '/map.jpg'
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
    drawAllOverlays()
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
    drawAllOverlays()
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
    drawAllOverlays()
  },
  { deep: true, immediate: true }
)

watch(
  () => activeTypes.value,
  () => {
    drawAllOverlays()
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
          <span>{{ type }}</span>
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
