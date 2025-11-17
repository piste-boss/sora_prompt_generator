import { createStore } from './_lib/store.js'

export const config = {
  blobs: true,
}

export const handler = async (_event, context) => {
  const store = createStore('sora_prompt_generator_uploads', context)
  await store.set('hello.txt', 'こんにちは Blobs')
  const txt = await store.get('hello.txt', { type: 'text' })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: `stored: ${txt}`,
  }
}
