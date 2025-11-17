import { getStore } from '@netlify/blobs'

const DEFAULT_STORE_NAME = 'sora_prompt_generator'

const resolveStoreName = (name) => {
  if (name) return name
  if (process.env.NETLIFY_BLOBS_STORE) return process.env.NETLIFY_BLOBS_STORE
  if (process.env.BLOBS_STORE_NAME) return process.env.BLOBS_STORE_NAME
  return DEFAULT_STORE_NAME
}

const getCredentials = () => {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.BLOBS_SITE_ID
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.BLOBS_TOKEN

  if (!siteID && !token) {
    return null
  }

  return { siteID, token }
}

export const createStore = (name, context) => {
  const storeName = resolveStoreName(name)
  if (context?.netlify?.blobs?.getStore) {
    return context.netlify.blobs.getStore({ name: storeName })
  }

  const credentials = getCredentials()
  if (credentials) {
    return getStore({
      name: storeName,
      ...credentials,
    })
  }
  return getStore({ name: storeName })
}

export const getConfigStore = (context) => createStore(undefined, context)
