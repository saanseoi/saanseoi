<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { onMount } from 'svelte'
import { fade } from 'svelte/transition'

type Question = {
  answered: boolean
  deferUntilId?: string
  id: string
  label: string
  reminderTitle?: string
}

type Props = {
  dismissLabel: string
  questions: Question[]
  title: string
}

let { dismissLabel, questions, title }: Props = $props()
let missingQuestion = $state<Question>()
let dismissedQuestionId = $state<string>()
let reminderElement = $state<HTMLElement>()
let reminderStartScrollY = $state<number>()
let reminderTop = $state<number>()
let isVisible = $derived(
  Boolean(missingQuestion && missingQuestion.id !== dismissedQuestionId),
)

const updateReminderPosition = () => {
  if (!missingQuestion || missingQuestion.id === dismissedQuestionId) return

  const reminderHeight = reminderElement?.getBoundingClientRect().height ?? 72
  const lowerPosition = window.innerHeight - reminderHeight - 20
  const middlePosition = Math.max(20, (window.innerHeight - reminderHeight) / 2)
  const distanceScrolled = Math.max(
    0,
    window.scrollY - (reminderStartScrollY ?? window.scrollY),
  )

  reminderTop = Math.max(middlePosition, lowerPosition - distanceScrolled)
}

const updateMissingQuestion = () => {
  const headerHeight =
    document.querySelector('header')?.getBoundingClientRect().height ?? 72
  const scrollOffset = headerHeight + 16
  const nextMissingQuestion = questions.find(question => {
    if (question.answered) return false

    if (question.deferUntilId) {
      const deferUntilElement = document.getElementById(question.deferUntilId)
      if (
        !deferUntilElement ||
        deferUntilElement.getBoundingClientRect().bottom >= scrollOffset
      ) {
        return false
      }
    }

    const element = document.getElementById(question.id)
    return Boolean(element && element.getBoundingClientRect().bottom < scrollOffset)
  })

  if (nextMissingQuestion?.id !== missingQuestion?.id) {
    missingQuestion = nextMissingQuestion
    reminderStartScrollY = nextMissingQuestion ? window.scrollY : undefined
    reminderTop = undefined
  }

  requestAnimationFrame(updateReminderPosition)
}

const scrollToMissingQuestion = () => {
  if (!missingQuestion) return

  const element = document.getElementById(missingQuestion.id)
  if (!element) return

  const headerHeight =
    document.querySelector('header')?.getBoundingClientRect().height ?? 72
  const viewportOvershoot = window.innerHeight * 0.3
  window.scrollTo({
    behavior: 'smooth',
    top: Math.max(
      0,
      window.scrollY +
        element.getBoundingClientRect().top -
        headerHeight -
        16 -
        viewportOvershoot,
    ),
  })
}

const dismiss = () => {
  dismissedQuestionId = missingQuestion?.id
}

$effect(() => {
  void questions
  requestAnimationFrame(updateMissingQuestion)
})

onMount(() => {
  const update = () => updateMissingQuestion()

  update()
  window.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)

  return () => {
    window.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
  }
})
</script>

{#if isVisible && missingQuestion}
  <aside
    bind:this={reminderElement}
    class={`fixed left-1/2 z-60 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 border border-[#d73a3a] bg-[#fff4f2]/95 px-4 py-3 shadow-popover backdrop-blur-sm dark:border-[#ef8b88]/80 dark:bg-background/95 lg:left-[calc((100vw-12rem)/2)] ${reminderTop === undefined ? 'bottom-5' : ''}`}
    style:top={reminderTop === undefined ? undefined : `${reminderTop}px`}
    aria-live="polite"
    in:fade={{ duration: 160 }}
    out:fade={{ duration: 120 }}
  >
    <button
      class="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:bg-[#d73a3a]/10 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#b42318] dark:hover:bg-[#ef8b88]/10 dark:focus-visible:outline-[#ef8b88]"
      type="button"
      onclick={scrollToMissingQuestion}
    >
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#fbd0cc] text-[#b42318] dark:bg-[#ef8b88]/15 dark:text-[#ffb4b1]"
      >
        <Icon
          icon="material-symbols-light:arrow-upward-rounded"
          class="size-5"
          aria-hidden="true"
        />
      </span>
      <span class="min-w-0">
        <span
          class="block font-body text-label-sm font-semibold tracking-[0.12em] text-[#b42318] uppercase dark:text-[#ffb4b1]"
          >{missingQuestion.reminderTitle ?? title}</span
        >
        <span
          class="mt-0.5 block truncate font-body text-body-sm leading-5 text-foreground-alt"
          >{missingQuestion.label}</span
        >
      </span>
    </button>
    <button
      class="grid size-8 shrink-0 place-items-center rounded-sm text-foreground-alt transition-colors hover:bg-[#d73a3a]/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#b42318] dark:hover:bg-[#ef8b88]/10 dark:focus-visible:outline-[#ef8b88]"
      type="button"
      onclick={dismiss}
    >
      <Icon
        icon="material-symbols-light:close-rounded"
        class="size-5"
        aria-hidden="true"
      />
      <span class="sr-only">{dismissLabel}</span>
    </button>
  </aside>
{/if}
