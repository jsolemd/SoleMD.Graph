import { Container, Skeleton, Stack, SimpleGrid } from '@mantine/core'

export default function EducationLoading() {
  return (
    <Container size="lg" py="xl">
      <Stack gap="xl" className="min-h-[70vh]">
        <Skeleton height={40} width="45%" mx="auto" radius="xl" />
        <Skeleton height={20} width="30%" mx="auto" radius="xl" />
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg" mt="xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={220} radius="lg" />
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
