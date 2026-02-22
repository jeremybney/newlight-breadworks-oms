import { Product } from '@/types'

export const PRODUCTS: Product[] = [
  // ── RYE ──────────────────────────────────────────────────────────────────
  { id: 'rye-large',             name: 'Deli Rye (Large)',             category: 'RYE', canBeSliced: true,  active: true, sortOrder: 10 },
  { id: 'rye-retail',            name: 'Deli Rye (Retail)',            category: 'RYE', canBeSliced: true,  active: true, sortOrder: 11 },
  { id: 'rye-dinner-roll',       name: 'Deli Rye Dinner Roll',         category: 'RYE', canBeSliced: false, active: true, sortOrder: 12 },
  { id: 'mini-deli-rye-roll',    name: 'Mini Deli Rye Roll',           category: 'RYE', canBeSliced: false, active: true, sortOrder: 13 },
  { id: 'rye-hoagie',            name: 'Rye Hoagie',                   category: 'RYE', canBeSliced: false, active: true, sortOrder: 14 },

  // ── MULTIGRAIN ────────────────────────────────────────────────────────────
  { id: 'mg-large',              name: 'Multigrain (Large)',           category: 'MULTIGRAIN', canBeSliced: true,  active: true, sortOrder: 20 },
  { id: 'mg-retail',             name: 'Multigrain (Retail)',          category: 'MULTIGRAIN', canBeSliced: true,  active: true, sortOrder: 21 },
  { id: 'mg-boule',              name: 'Multigrain Boule',             category: 'MULTIGRAIN', canBeSliced: true,  active: true, sortOrder: 22 },
  { id: 'mg-batard',             name: 'Multigrain Batard',            category: 'MULTIGRAIN', canBeSliced: true,  active: true, sortOrder: 23 },
  { id: 'mg-baguette',           name: '17" Multigrain Baguette',      category: 'MULTIGRAIN', canBeSliced: false, active: true, sortOrder: 24 },
  { id: 'mg-hoagie',             name: 'Multigrain Hoagie',            category: 'MULTIGRAIN', canBeSliced: false, active: true, sortOrder: 25 },
  { id: 'mg-burger-bun',         name: 'Multigrain Burger Bun',        category: 'MULTIGRAIN', canBeSliced: false, active: true, sortOrder: 26 },
  { id: 'mg-dinner-roll',        name: 'Multigrain Dinner Roll',       category: 'MULTIGRAIN', canBeSliced: false, active: true, sortOrder: 27 },
  { id: 'mg-mini-roll',          name: 'Mini Multigrain Roll',         category: 'MULTIGRAIN', canBeSliced: false, active: true, sortOrder: 28 },
  { id: 'whole-wheat-hoagie',    name: 'Whole Wheat Hoagie',           category: 'MULTIGRAIN', canBeSliced: false, active: true, sortOrder: 29 },

  // ── MILK BREAD ────────────────────────────────────────────────────────────
  { id: 'mb-5in-burger-bun',     name: '5" Milk Burger Buns',          category: 'MILK_BREAD', canBeSliced: false, active: true, sortOrder: 30 },
  { id: 'mb-5in-burger-seeded',  name: '5" Milk Burger Buns (Seeded)', category: 'MILK_BREAD', canBeSliced: false, active: true, sortOrder: 31 },
  { id: 'mb-4in-burger-bun',     name: '4" Milk Burger Bun',           category: 'MILK_BREAD', canBeSliced: false, active: true, sortOrder: 32 },
  { id: 'mb-bread-slider-seeded',name: '2.5" Milk Bread Slider (Seeded)', category: 'MILK_BREAD', canBeSliced: false, active: true, sortOrder: 33 },
  { id: 'mb-bread-slider',       name: '2.5" Milk Bread Slider',       category: 'MILK_BREAD', canBeSliced: false, active: true, sortOrder: 34 },
  { id: 'mb-large',              name: 'Milk Bread (Large)',            category: 'MILK_BREAD', canBeSliced: true,  active: true, sortOrder: 35 },
  { id: 'mb-retail',             name: 'Milk Bread (Retail)',           category: 'MILK_BREAD', canBeSliced: true,  active: true, sortOrder: 36 },
  { id: 'mb-large-fit-sliced',   name: 'Milk Bread Large (Fit Sliced)', category: 'MILK_BREAD', canBeSliced: true,  active: true, sortOrder: 37 },
  { id: 'mb-large-sliced',       name: 'Milk Bread Large (Sliced)',    category: 'MILK_BREAD', canBeSliced: true,  active: true, sortOrder: 38 },
  { id: 'mb-mini-loaf-roll',     name: 'Mini Milk Bread Roll',         category: 'MILK_BREAD', canBeSliced: false, active: true, sortOrder: 39 },

  // ── BRIOCHE ───────────────────────────────────────────────────────────────
  { id: 'brioche-pullman-retail',name: 'Brioche Pullman (Retail)',     category: 'BRIOCHE', canBeSliced: true,  active: true, sortOrder: 40 },
  { id: 'brioche-pullman-large', name: 'Brioche Pullman (Large)',      category: 'BRIOCHE', canBeSliced: true,  active: true, sortOrder: 41 },
  { id: 'bun-sesame-seeded',     name: 'Hamburger Bun (Sesame Seeded)', category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 42 },
  { id: 'bun-everything',        name: 'Hamburger Bun (Everything)',   category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 43 },
  { id: 'bun-plain',             name: 'Hamburger Bun',               category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 44 },
  { id: 'bun-mini-hamburger',    name: 'Mini Hamburger Bun',          category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 45 },
  { id: 'bun-large-hamburger',   name: 'Large Hamburger Bun',         category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 46 },
  { id: 'bun-large-seeded',      name: 'Large Hamburger Bun (Seeded)', category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 47 },
  { id: 'parker-house-roll',     name: 'Parker House Roll',           category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 48 },
  { id: 'parker-house-roll-oeuf',name: "Parker House Roll (Oeuf)",    category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 49 },
  { id: 'hotdog-bun',            name: 'Hot Dog Bun',                 category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 50 },
  { id: 'hotdog-bun-8in',        name: '8" Hot Dog Bun',              category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 51 },
  { id: 'hotdog-bun-mini',       name: 'Mini Hot Dog Bun',            category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 52 },
  { id: 'parker-house-dinner',   name: 'Parker House Dinner Roll',    category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 53 },
  { id: 'mini-hotdog-bun',       name: '2" Hot Dog Bun',              category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 54 },

  // ── POOLISH ───────────────────────────────────────────────────────────────
  { id: 'italian-baguette',      name: 'Italian Baguette',            category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 60 },
  { id: 'demi-italian-baguette', name: 'Demi Italian Baguette',       category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 61 },
  { id: 'mini-baguette',         name: 'Mini Baguette',               category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 62 },
  { id: 'italian-baguette-24in', name: '24" Italian Baguette',        category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 63 },
  { id: 'ciabatta-large',        name: 'Ciabatta (Large)',            category: 'POOLISH', canBeSliced: true,  active: true, sortOrder: 64 },
  { id: 'ciabatta-small',        name: 'Ciabatta (Small)',            category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 65 },
  { id: 'ciabatta-4in',          name: '4" Ciabatta',                 category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 66 },
  { id: 'ciabatta-6in',          name: '6" Ciabatta',                 category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 67 },
  { id: 'ciabatta-medium',       name: 'Medium Ciabatta',             category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 68 },
  { id: 'ciabatta-large-loaf',   name: 'Large Ciabatta',              category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 69 },
  { id: 'italian-hoagie-p',      name: 'Italian Hoagie P',            category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 70 },
  { id: 'italian-hoagie-s',      name: 'Italian Hoagie S',            category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 71 },
  { id: 'italian-slider',        name: 'Italian Slider',              category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 72 },
  { id: 'italian-dinner-roll',   name: 'Italian Dinner Roll',         category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 73 },
  { id: 'italian-burger-bun-reg',name: 'Italian Burger Bun Reg',      category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 74 },
  { id: 'italian-burger-bun',    name: 'Italian Burger Bun',          category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 75 },
  { id: 'italian-batard',        name: 'Italian Batard',              category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 76 },
  { id: 'italian-batard-large',  name: 'Italian Batard (Large)',      category: 'POOLISH', canBeSliced: true,  active: true, sortOrder: 77 },
  { id: 'olive-italian-batard',  name: 'Olive Italian Batard',        category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 78 },

  // ── BAGUETTE / FOCACCIA ───────────────────────────────────────────────────
  { id: 'sd-baguette-24in',      name: '24" Sourdough Baguette',      category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 80 },
  { id: 'sd-focaccia-wholesale', name: 'Sourdough Focaccia (Wholesale)', category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 81 },
  { id: 'sd-focaccia-retail',    name: 'Sourdough Focaccia (Retail)', category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 82 },
  { id: 'sd-focaccia-half',      name: 'Sourdough Focaccia (Half Sheet)', category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 83 },
  { id: 'sd-baguette',           name: 'Sourdough Baguette',          category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 84 },
  { id: 'demi-sd-baguette',      name: 'Demi Sourdough Baguette',     category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 85 },
  { id: 'fougasse',              name: 'Fougasse',                    category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 86 },
  { id: 'sd-pullman-large',      name: 'Sourdough Pullman (Large)',   category: 'BAGUETTE_FOCACCIA', canBeSliced: true,  active: true, sortOrder: 87 },
  { id: 'sd-dinner-roll',        name: 'Sourdough Dinner Roll',       category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 88 },
  { id: 'sd-burger-bun',         name: 'Sourdough Burger Bun',        category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 89 },
  { id: 'mini-sd-roll',          name: 'Mini Sourdough Roll',         category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 90 },

  // ── BOULE ─────────────────────────────────────────────────────────────────
  { id: 'boule-4in',             name: '4" Boule',                    category: 'BOULE', canBeSliced: false, active: true, sortOrder: 100 },
  { id: 'boule-8in',             name: '8" Boule',                    category: 'BOULE', canBeSliced: false, active: true, sortOrder: 101 },
  { id: 'sd-boule-large-orig',   name: 'Large Sourdough Boule (Original)', category: 'BOULE', canBeSliced: true,  active: true, sortOrder: 102 },
  { id: 'sd-boule-large-seeded', name: 'Large Sourdough Boule (Seeded)',   category: 'BOULE', canBeSliced: true,  active: true, sortOrder: 103 },
  { id: 'sd-batard',             name: 'Sourdough Batard',            category: 'BOULE', canBeSliced: true,  active: true, sortOrder: 104 },
  { id: 'sd-batard-seeded',      name: 'Sourdough Batard (Seeded)',   category: 'BOULE', canBeSliced: true,  active: true, sortOrder: 105 },
  { id: 'sd-batard-tri-sliced',  name: 'Large Sourdough Batard (Tri Sliced)', category: 'BOULE', canBeSliced: true,  active: true, sortOrder: 106 },
  { id: 'large-batard',          name: 'Large Batard',                category: 'BOULE', canBeSliced: true,  active: true, sortOrder: 107 },
  { id: 'large-batard-sliced',   name: 'Large Batard (TH Sliced)',    category: 'BOULE', canBeSliced: true,  active: true, sortOrder: 108 },

  // ── SEMOLINA ──────────────────────────────────────────────────────────────
  { id: 'semolina',              name: 'Semolina',                    category: 'SEMOLINA', canBeSliced: true,  active: true, sortOrder: 110 },
  { id: 'semolina-hoagie',       name: 'Semolina Hoagie',             category: 'SEMOLINA', canBeSliced: false, active: true, sortOrder: 111 },
  { id: 'semolina-baguette-24in',name: '24" Semolina Baguette',       category: 'SEMOLINA', canBeSliced: false, active: true, sortOrder: 112 },
  { id: 'semolina-burger-bun',   name: 'Semolina Burger Bun',         category: 'SEMOLINA', canBeSliced: false, active: true, sortOrder: 113 },
  { id: 'mini-semolina-roll',    name: 'Mini Semolina Roll (Seeded)', category: 'SEMOLINA', canBeSliced: false, active: true, sortOrder: 114 },
  { id: 'semolina-hoagie-lg',    name: 'Semolina Hoagie (Large)',     category: 'SEMOLINA', canBeSliced: false, active: true, sortOrder: 115 },
  { id: 'semolina-hoagie-seeded',name: 'Semolina Hoagie (No Seeds)',  category: 'SEMOLINA', canBeSliced: false, active: true, sortOrder: 116 },

  // ── PRETZEL ───────────────────────────────────────────────────────────────
  { id: 'pretzel-loop-lg-sliced',name: 'Large Pretzel Loop (Sliced)', category: 'PRETZEL', canBeSliced: true,  active: true, sortOrder: 120 },
  { id: 'pretzel-loop-lg-soft',  name: 'Large Pretzel Loop (Soft)',   category: 'PRETZEL', canBeSliced: false, active: true, sortOrder: 121 },
  { id: 'jumbo-pretzel-sliced',  name: 'Jumbo Pretzel Loop (Slated)', category: 'PRETZEL', canBeSliced: true,  active: true, sortOrder: 122 },
  { id: 'pretzel-hero-nosalt',   name: 'Pretzel Hero 7" (No Salt)',   category: 'PRETZEL', canBeSliced: false, active: true, sortOrder: 123 },
  { id: 'pretzel-burger-bun',    name: 'Pretzel Burger Bun',          category: 'PRETZEL', canBeSliced: false, active: true, sortOrder: 124 },
  { id: 'pretzel-parker-house',  name: 'Pretzel Parker House Roll',   category: 'PRETZEL', canBeSliced: false, active: true, sortOrder: 125 },

  // ── CHALLAH ───────────────────────────────────────────────────────────────
  { id: 'challah-roll',          name: 'Challah Roll',                category: 'CHALLAH', canBeSliced: false, active: true, sortOrder: 130 },
  { id: 'challah-parker-house',  name: 'Challah Parker House Roll',   category: 'CHALLAH', canBeSliced: false, active: true, sortOrder: 131 },
  { id: 'challah-burger-bun',    name: 'Challah Burger Bun',          category: 'CHALLAH', canBeSliced: false, active: true, sortOrder: 132 },

  // ── POTATO MILK ───────────────────────────────────────────────────────────
  { id: 'white-bread-large',     name: 'White Bread (Large)',         category: 'POTATO_MILK', canBeSliced: true,  active: true, sortOrder: 140 },

  // ── WHITE ─────────────────────────────────────────────────────────────────
  { id: 'sicilian-pizza',        name: 'Sicilian Pizza',              category: 'WHITE', canBeSliced: false, active: true, sortOrder: 150 },
  { id: 'scilian-roll',          name: 'Scilian Roll',                category: 'WHITE', canBeSliced: false, active: true, sortOrder: 151 },
  { id: 'sicilian',              name: 'Sicilian',                    category: 'WHITE', canBeSliced: false, active: true, sortOrder: 152 },

  // ── WHOLE WHEAT ───────────────────────────────────────────────────────────
  { id: 'ww-sandwich',           name: 'Whole Wheat Sandwich',        category: 'WHOLE_WHEAT', canBeSliced: true,  active: true, sortOrder: 160 },

  // ── COCO ──────────────────────────────────────────────────────────────────
  // (add coco products as needed)

  // ── OTHER ─────────────────────────────────────────────────────────────────
  { id: 'croissant',             name: 'Croissant',                   category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 170 },
  { id: 'plain-croissant',       name: 'Plain Croissant',             category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 171 },
  { id: 'chocolate-croissant',   name: 'Chocolate Croissant',         category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 172 },
  { id: 'semolina-twist',        name: 'Semolina Twist',              category: 'SEMOLINA', canBeSliced: false, active: true, sortOrder: 173 },
  { id: 'light-rye-sandwich',    name: 'Light Rye Sandwich',          category: 'RYE', canBeSliced: true,  active: true, sortOrder: 174 },
  { id: 'whole-wheat-sandwich',  name: 'Whole Wheat Sandwich',        category: 'WHOLE_WHEAT', canBeSliced: true,  active: true, sortOrder: 175 },
  { id: 'white-sandwich',        name: 'White Sandwich',              category: 'WHITE', canBeSliced: true,  active: true, sortOrder: 176 },
  { id: 'kaiser-roll',           name: '4" Kaiser Roll',              category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 177 },
  { id: 'kaiser-roll-slider',    name: 'Kaiser Roll Slider',          category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 178 },
  { id: 'mini-kaiser',           name: 'Mini Kaiser',                 category: 'POOLISH', canBeSliced: false, active: true, sortOrder: 179 },
  { id: 'portmanteau-sandwich',  name: 'Portmanteau Sandwich',        category: 'BRIOCHE', canBeSliced: false, active: true, sortOrder: 180 },
  { id: 'challah-burger-bun-2',  name: 'Challah Burger Bun',         category: 'CHALLAH', canBeSliced: false, active: true, sortOrder: 181 },
  { id: 'semolina-mini-baguette',name: 'Semolina Mini Baguette',      category: 'SEMOLINA', canBeSliced: false, active: true, sortOrder: 182 },
  { id: 'french-baguette',       name: '4" French Baguette',          category: 'BAGUETTE_FOCACCIA', canBeSliced: false, active: true, sortOrder: 183 },
]

export const getProductsByCategory = () => {
  const grouped: Record<string, Product[]> = {}
  PRODUCTS.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = []
    grouped[p.category].push(p)
  })
  return grouped
}

export const getProductById = (id: string) => PRODUCTS.find(p => p.id === id)
