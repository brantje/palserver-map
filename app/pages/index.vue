<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MapViewer from '~/components/MapViewer.vue'

type Player = {
  userId: string
  name: string
  level?: number
  location_x: number
  location_y: number
}

type MapObject = {
  x: number
  y: number
  type: string
  localized_name?: string
  pal?: string
  pal_type?: string
}

const pollMs = 3000
const errorMessage = ref<string | null>(null)
const toast = useToast()
let lastToastMessage: string | null = null

const {
  data: players,
  refresh: refreshPlayers
} = useAsyncData<Player[]>('players', async () => {
  try {
    const response = await $fetch<Player[]>('/api/palworld/players')
    errorMessage.value = null
    return response
  } catch (err: any) {
    errorMessage.value = err?.data?.message || 'Unable to load players.'
    return []
  }
}, { server: false })

const {
  data: info,
  refresh: refreshInfo
} = useAsyncData<{ servername?: string }>('info', async () => {
  try {
    const response = await $fetch<{ servername?: string }>('/api/palworld/info')
    return response
  } catch {
    errorMessage.value = 'Unable to load server info.'
    return {}
  }
}, { server: false })

const {
  data: mapObjects,
  refresh: refreshMapObjects
} = useAsyncData<MapObject[]>('mapObjects', async () => {
  try {
    const response = await $fetch<MapObject[]>('/api/map/objects')
    return response
  } catch (err: any) {
    // Non-fatal: players/map can still render without objects.
    errorMessage.value = err?.data?.message || 'Unable to load map objects.'
    return []
  }
}, { server: false })

let intervalId: any
onMounted(() => {
  intervalId = setInterval(() => {
    refreshPlayers()
    refreshInfo()
    refreshMapObjects()
  }, pollMs)
})

onBeforeUnmount(() => {
  if (intervalId) clearInterval(intervalId)
})

watch(errorMessage, (value) => {
  if (!value) {
    lastToastMessage = null
    return
  }

  if (value === lastToastMessage) return

  lastToastMessage = value
  toast.add({
    title: 'Refresh failed',
    description: value,
    color: 'warning'
  })
})

const handleConnected = () => {
  refreshPlayers()
  refreshInfo()
  refreshMapObjects()
}
</script>

<template>
  <section>
    <MapViewer
      :players="players || []"
      :map-objects="mapObjects || []"
      :server-name="info?.servername"
      @connected="handleConnected"
    />
  </section>
</template>

