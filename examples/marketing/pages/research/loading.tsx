import { Container, Skeleton, Stack, SimpleGrid } from '@mantine/core'

export default function ResearchLoading() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="xl" className="min-h-[70vh]">
        <Skeleton height={40} width="50%" mx="auto" radius="xl" />
        <Skeleton height={20} width="35%" mx="auto" radius="xl" />
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xl">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={180} radius="lg" />
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
