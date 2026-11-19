import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import type { SimStep } from '../types/core';

export function useStepPlayer<T>(steps: Ref<SimStep<T>[]>, baseDelayMs = 850) {
  const stepIndex = ref(0);
  const isPlaying = ref(false);
  const speed = ref(1);
  let timer: number | undefined;

  const totalSteps = computed(() => steps.value.length);
  const safeIndex = computed(() => {
    if (totalSteps.value <= 0) return 0;
    return Math.min(Math.max(0, stepIndex.value), totalSteps.value - 1);
  });

  const currentStep = computed<SimStep<T> | undefined>(() => {
    return steps.value[safeIndex.value];
  });

  const clearTimer = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };

  const scheduleNext = () => {
    clearTimer();
    if (!isPlaying.value || totalSteps.value <= 1) return;
    if (safeIndex.value >= totalSteps.value - 1) {
      isPlaying.value = false;
      return;
    }
    const delay = Math.max(100, Math.round(baseDelayMs / speed.value));
    timer = window.setTimeout(() => {
      if (stepIndex.value < totalSteps.value - 1) {
        stepIndex.value += 1;
        scheduleNext();
      } else {
        isPlaying.value = false;
      }
    }, delay);
  };

  watch(steps, (nextSteps) => {
    if (nextSteps.length === 0) {
      stepIndex.value = 0;
      isPlaying.value = false;
    } else if (stepIndex.value >= nextSteps.length) {
      stepIndex.value = nextSteps.length - 1;
      isPlaying.value = false;
    }
  });

  watch([isPlaying, speed], () => {
    if (isPlaying.value) {
      scheduleNext();
    } else {
      clearTimer();
    }
  });

  onUnmounted(() => clearTimer());

  const play = () => {
    if (totalSteps.value <= 1) return;
    if (safeIndex.value >= totalSteps.value - 1) {
      stepIndex.value = 0;
    }
    isPlaying.value = true;
  };

  const pause = () => {
    isPlaying.value = false;
  };

  const togglePlay = () => {
    if (isPlaying.value) pause();
    else play();
  };

  const next = () => {
    pause();
    stepIndex.value = Math.min(Math.max(0, totalSteps.value - 1), safeIndex.value + 1);
  };

  const prev = () => {
    pause();
    stepIndex.value = Math.max(0, safeIndex.value - 1);
  };

  const reset = () => {
    pause();
    stepIndex.value = 0;
  };

  const goToEnd = () => {
    pause();
    stepIndex.value = Math.max(0, totalSteps.value - 1);
  };

  const jumpTo = (idx: number) => {
    pause();
    stepIndex.value = Math.min(Math.max(0, totalSteps.value - 1), Math.max(0, idx));
  };

  return {
    stepIndex: safeIndex,
    totalSteps,
    currentStep,
    isPlaying,
    speed,
    play,
    pause,
    togglePlay,
    next,
    prev,
    reset,
    goToEnd,
    jumpTo,
  };
}

import { computed as vueComputed } from 'vue';

export function bindLabPlayer<T>(player: ReturnType<typeof useStepPlayer<T>>) {
  return vueComputed(() => ({
    stepIndex: player.stepIndex.value,
    totalSteps: player.totalSteps.value,
    isPlaying: player.isPlaying.value,
    speed: player.speed.value,
    stepTitle: player.currentStep.value?.title,
    stepDesc: player.currentStep.value?.description,
    codeLine: player.currentStep.value?.codeLine,
    togglePlay: player.togglePlay,
    prev: player.prev,
    next: player.next,
    reset: player.reset,
    goToEnd: player.goToEnd,
    jumpTo: player.jumpTo,
    setSpeed: (s: number) => {
      player.speed.value = s;
    },
  }));
}

