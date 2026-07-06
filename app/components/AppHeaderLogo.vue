<script setup lang="ts">
const props = defineProps<{
  white?: boolean
}>()

const isBlinking = ref(false)
const isHovering = ref(false)
const isTouchDevice = ref(false)
let cleanup: (() => void) | undefined

const color = computed(() => props.white ? 'text-white' : 'text-black dark:text-white')

const logoElement = ref()
const toast = useToast()

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {
    return false
  }
}

function setupBlinking() {
  const blinkDelay = Math.random() * 5000 + 2000

  const timerId = setTimeout(() => {
    isBlinking.value = true

    const blinkTimerId = setTimeout(() => {
      isBlinking.value = false
      setupBlinking()
    }, 200)

    return () => clearTimeout(blinkTimerId)
  }, blinkDelay)

  return () => clearTimeout(timerId)
}

const copyLogo = async () => {
  if (logoElement.value) {
    const success = await copyToClipboard(logoElement.value.outerHTML)
    if (success) {
      toast.add({
        title: 'Docus logo copied as SVG',
        description: 'You can now paste it into your project',
        icon: 'i-lucide-circle-check',
        color: 'success',
      })
    }
    else {
      toast.add({
        title: 'Failed to copy logo',
        description: 'Please try again',
        icon: 'i-lucide-circle-x',
        color: 'error',
      })
    }
  }
}

const downloadLogo = () => {
  if (logoElement.value) {
    const svgData = logoElement.value.outerHTML
    const blob = new Blob([svgData], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'docus-logo.svg'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.add({
      title: 'Docus logo downloaded',
      description: 'The SVG file has been saved',
      icon: 'i-lucide-download',
      color: 'success',
    })
  }
}

const logoContextMenuItems = [
  [{
    label: 'Copy logo as SVG',
    icon: 'i-lucide-copy',
    onSelect() {
      copyLogo()
    },
  }],
  [{
    label: 'Download SVG',
    icon: 'i-lucide-download',
    onSelect() {
      downloadLogo()
    },
  }],
]

onMounted(() => {
  cleanup = setupBlinking()
  isTouchDevice.value = 'ontouchstart' in window
})

onBeforeUnmount(() => {
  cleanup?.()
})
</script>

<template>
  <UContextMenu :items="logoContextMenuItems">
    <img
      ref="logoElement"
      src="/cropped-NDPC_logo.png"
      alt="NDPC logo"
      :class="color"
      class="h-12 w-auto"
      @mouseenter="isHovering = true"
      @mouseleave="isHovering = false"
    />
  </UContextMenu>
</template>
