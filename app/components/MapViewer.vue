<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch, ref } from 'vue'


type Player = {
  userId: string
  name: string
  level?: number
  location_x: number
  location_y: number
  ping?: number
}

const props = defineProps<{
  players: Player[]
  serverName?: string
}>()

const viewer = shallowRef<any>(null)
const osdLib = shallowRef<any>(null)
const containerEl = ref<HTMLDivElement | null>(null)
const coordsDisplay = ref('0,0')
let mouseTracker: any
const isReady = ref(false)

function toViewportCoords(xLoc: number, yLoc: number, imageSize: any) {
  const viewportX = ((xLoc + 1000) / 2000) * imageSize.x
  const viewportY = ((1000 - yLoc) / 2000) * imageSize.y
  return { viewportX, viewportY }
}

function drawPlayers() {
  if (!viewer.value || !viewer.value.source || !props.players || !osdLib.value) return
  const imageSize = viewer.value.source?.dimensions
  if (!imageSize) return
  viewer.value.clearOverlays()

  props.players.forEach((player) => {
    const xLoc = (player.location_y - 156844.55791065) / 462.962962963
    const yLoc = (player.location_x + 121467.1611767) / 462.962962963
    const { viewportX, viewportY } = toViewportCoords(xLoc, yLoc, imageSize)
    const location = viewer.value.viewport.imageToViewportCoordinates(viewportX, viewportY)
    const dot = document.createElement('div')
    dot.className = 'test-overlay'

    // Round by 2 decimal places and remove the decimal point
    let ping = player.ping?.toFixed(2)
    const label = document.createElement('div')
    label.className = 'player-label'
    // ping bottom right
    label.innerHTML = `<span>Lv.${player.level ?? '?'}</span> <span>${player.name}</span><span class="ping-label">Ping: ${ping}ms</span>`
    dot.appendChild(label)

    viewer.value.addOverlay({
      element: dot,
      location,
      checkResize: false,
      placement: osdLib.value.Placement.CENTER
    })
  })
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
    drawPlayers()
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
    drawPlayers()
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
    </div>
    <div class="info">
      <a href="https://github.com/brantje/palserver-map" target="_blank">palserver map</a>
    </div>
    <div id="cursorViewportPosition">{{ coordsDisplay }}</div>
    <div ref="containerEl" id="openseadragon"></div>
  </div>
</template>

