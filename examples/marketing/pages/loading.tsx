import { Container, Skeleton, Stack } from '@mantine/core'

export default function Loading() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="xl" className="min-h-[70vh]" justify="center">
        <Skeleton height={40} width="60%" mx="auto" radius="xl" />
        <Skeleton height={20} width="40%" mx="auto" radius="xl" />
        <Stack gap="md" mt="xl">
          <Skeleton height={200} radius="lg" />
          <Skeleton height={200} radius="lg" />
        </Stack>
      </Stack>
    </Container>
  )
}
