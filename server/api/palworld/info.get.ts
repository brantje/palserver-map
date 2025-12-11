import axios from 'axios'
import { createError } from 'h3'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const palworld = config.palworld
  if (!palworld?.host || !palworld?.port || !palworld?.password) {
    throw createError({ statusCode: 500, statusMessage: 'Palworld connection not configured in runtime config' })
  }

  try {
    const result = await axios.get(`http://${palworld.host}:${palworld.port}/v1/api/info`, {
      auth: {
        username: 'admin',
        password: palworld.password
      }
    })
    return result.data || {}
  } catch (error: any) {
    throw createError({
      statusCode: 502,
      statusMessage: error?.response?.data?.message || 'Unable to fetch info'
    })
  }
})

