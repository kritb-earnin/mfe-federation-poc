<script setup lang="ts">
import { breadcrumbClass } from "@poc/design-system/variants";
import { mergeAttrs } from "../lib/merge-attrs";

// Like React: class and data-* land on the inner <ol>, not the <nav>.
defineOptions({ inheritAttrs: false });
</script>

<template>
  <nav aria-label="breadcrumb">
    <ol v-bind="mergeAttrs($attrs, breadcrumbClass)"><slot /></ol>
  </nav>
</template>
