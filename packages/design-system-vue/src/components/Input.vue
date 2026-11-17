<script setup lang="ts">
import { inputClass } from "@poc/design-system/variants";
import { mergeAttrs } from "../lib/merge-attrs";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <input v-bind="mergeAttrs($attrs, inputClass)" />
</template>
