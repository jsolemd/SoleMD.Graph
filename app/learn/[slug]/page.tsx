"use client";

import "@/features/learn/modules/ai-for-mds/register";

import React, { Suspense } from "react";
import { useParams, notFound } from "next/navigation";
import { Stack, Skeleton } from "@mantine/core";
import { getModule } from "@/features/learn/registry";

function LoadingSkeleton() {
  return (
    <Stack gap="md" className="px-6 py-8">
      <Skeleton height={40} width="60%" radius="md" />
      <Skeleton height={20} width="40%" radius="md" />
      <Skeleton height={300} radius="md" />
      <Skeleton height={200} radius="md" />
    </Stack>
  );
}

export default function LearnModulePage() {
  const { slug } = useParams<{ slug: string }>();
  const registration = getModule(slug);

  if (!registration) {
    notFound();
  }

  const ModulePage = React.lazy(registration.load);

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ModulePage />
    </Suspense>
  );
}
