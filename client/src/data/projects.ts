export type Project = {
  id: string | number;
  title: string;
  category: string;
  shortDescription: string;
  description: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  technologies: string[];
  seller: string;
  demoUrl: string;
  badge?: string;
  codeMarketAssured?: boolean;
  integrityScore?: number;
  image: string;
};

export const categories = [
  'Web Development',
  'Android',
  'Java',
  'Python',
  'AI & Machine Learning',
  'Data Science',
  'Cybersecurity',
  'IoT',
  'PHP',
  '.NET',
  'React',
  'Node.js'
];

export const projects: Project[] = [
  {
    id: 1,
    title: 'Gym Management System',
    category: 'Web Development',
    shortDescription: 'A complete fitness club and member management solution.',
    description: 'Manage memberships, billing, attendance, trainers, schedules, and online bookings with a scalable web platform.',
    price: 1499,
    originalPrice: 2499,
    rating: 4.9,
    reviews: 138,
    technologies: ['React', 'Node.js', 'PostgreSQL'],
    seller: 'FitStack Labs',
    demoUrl: 'https://example.com/gym-demo',
    badge: 'Popular',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80'
  },
  {
    id: 2,
    title: 'Hospital Management System',
    category: 'Healthcare Tech',
    shortDescription: 'Digital admin and patient workflows for healthcare organizations.',
    description: 'Streamline patient records, appointments, billing, lab workflows, and staff operations from a single dashboard.',
    price: 1899,
    rating: 4.8,
    reviews: 112,
    technologies: ['PHP', 'MySQL', 'jQuery'],
    seller: 'CareCore Studio',
    demoUrl: 'https://example.com/hospital-demo',
    image: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80'
  },
  {
    id: 3,
    title: 'AI Chatbot SaaS',
    category: 'AI & Machine Learning',
    shortDescription: 'Conversational support bot with CRM integrations.',
    description: 'Deploy a smart AI assistant for customer support, sales lead capture, and onboarding across multiple channels.',
    price: 2499,
    originalPrice: 3499,
    rating: 5.0,
    reviews: 96,
    technologies: ['Python', 'FastAPI', 'OpenAI'],
    seller: 'PromptForge',
    demoUrl: 'https://example.com/chatbot-demo',
    badge: 'Best Seller',
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80'
  },
  {
    id: 4,
    title: 'College Management System',
    category: 'Education',
    shortDescription: 'Academic operations, fees, attendance, and LMS portal.',
    description: 'Handle students, faculty, schedules, exam planning, admissions, and performance analytics with ease.',
    price: 1299,
    rating: 4.7,
    reviews: 76,
    technologies: ['React', 'Node.js', 'MongoDB'],
    seller: 'CampusGrid',
    demoUrl: 'https://example.com/college-demo',
    image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80'
  }
];
