import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SoundSeed {
  id: string;
  name: string;
  description: string;
  url: string;
  fileSizeMB: number;
  durationSec: number;
  order: number;
}

const SOUNDS: SoundSeed[] = [
  {
    id: 'rain',
    name: 'Mưa rơi',
    description: 'Tiếng mưa nhẹ',
    url: 'PASTE_URL_HERE',
    fileSizeMB: 0,
    durationSec: 0,
    order: 1,
  },
  {
    id: 'ocean',
    name: 'Sóng biển',
    description: 'Sóng vỗ',
    url: 'PASTE_URL_HERE',
    fileSizeMB: 0,
    durationSec: 0,
    order: 2,
  },
  {
    id: 'forest',
    name: 'Rừng xanh',
    description: 'Chim hót, lá xào xạc',
    url: 'PASTE_URL_HERE',
    fileSizeMB: 0,
    durationSec: 0,
    order: 3,
  },
  {
    id: 'white_noise',
    name: 'Nhiễu trắng',
    description: 'Âm tĩnh tập trung',
    url: 'PASTE_URL_HERE',
    fileSizeMB: 0,
    durationSec: 0,
    order: 4,
  },
  {
    id: 'ambient_pad',
    name: 'Pad du dương',
    description: 'Synth pad',
    url: 'PASTE_URL_HERE',
    fileSizeMB: 0,
    durationSec: 0,
    order: 5,
  },
  {
    id: 'bowl',
    name: 'Chuông thiền',
    description: 'Singing bowl',
    url: 'PASTE_URL_HERE',
    fileSizeMB: 0,
    durationSec: 0,
    order: 6,
  },
];

async function main() {
  for (const sound of SOUNDS) {
    if (sound.url === 'PASTE_URL_HERE') {
      console.warn(`Skip "${sound.id}" URL chưa được cập nhật.`);
      continue;
    }
    await prisma.meditationSound.upsert({
      where: { id: sound.id },
      create: { ...sound, active: true },
      update: {
        name: sound.name,
        description: sound.description,
        url: sound.url,
        fileSizeMB: sound.fileSizeMB,
        durationSec: sound.durationSec,
        order: sound.order,
        active: true,
      },
    });
    console.log(`Seeded "${sound.id}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
