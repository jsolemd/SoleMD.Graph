import { Container, Skeleton, Stack, Group } from '@mantine/core'

export default function AboutLoading() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="xl" className="min-h-[70vh]" justify="center">
        <Group justify="center">
          <Skeleton height={200} width={200} circle />
        </Group>
        <Skeleton height={36} width="50%" mx="auto" radius="xl" />
        <Stack gap="sm" align="center">
          <Skeleton height={16} width="80%" radius="xl" />
          <Skeleton height={16} width="70%" radius="xl" />
          <Skeleton height={16} width="75%" radius="xl" />
        </Stack>
        <Skeleton height={300} radius="lg" mt="xl" />
      </Stack>
    </Container>
  )
}
