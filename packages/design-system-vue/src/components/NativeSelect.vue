<script setup lang="ts">
import { nativeSelectClass } from "@poc/design-system/variants";
import { mergeAttrs } from "../lib/merge-attrs";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <select v-bind="mergeAttrs($attrs, nativeSelectClass)"><slot /></select>
</template>
