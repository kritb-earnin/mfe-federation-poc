<script setup lang="ts">
import { checkboxClass } from "@poc/design-system/variants";
import { mergeAttrs } from "../lib/merge-attrs";

defineOptions({ inheritAttrs: false });
</script>

<template>
  <input v-bind="mergeAttrs($attrs, checkboxClass)" type="checkbox" />
</template>
