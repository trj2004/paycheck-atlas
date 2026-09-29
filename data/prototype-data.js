window.PAYCHECK_ATLAS = {
  years: [2018, 2019, 2020, 2021, 2022, 2023, 2024],
  states: [
    { code: "CA", name: "California", rpp: 110.7, wage: 1.18, rent: 2250, transport: 455, tax: 0.255, mood: "high-cost" },
    { code: "HI", name: "Hawaii", rpp: 110.0, wage: 1.04, rent: 2200, transport: 510, tax: 0.235, mood: "high-cost" },
    { code: "NJ", name: "New Jersey", rpp: 108.8, wage: 1.16, rent: 2050, transport: 420, tax: 0.245, mood: "high-cost" },
    { code: "MA", name: "Massachusetts", rpp: 108.4, wage: 1.19, rent: 2150, transport: 390, tax: 0.235, mood: "high-cost" },
    { code: "WA", name: "Washington", rpp: 106.3, wage: 1.17, rent: 1850, transport: 375, tax: 0.205, mood: "high-cost" },
    { code: "CO", name: "Colorado", rpp: 105.2, wage: 1.10, rent: 1750, transport: 390, tax: 0.215, mood: "mid-cost" },
    { code: "IL", name: "Illinois", rpp: 99.5, wage: 1.01, rent: 1350, transport: 360, tax: 0.205, mood: "mid-cost" },
    { code: "MN", name: "Minnesota", rpp: 98.4, wage: 1.05, rent: 1250, transport: 340, tax: 0.215, mood: "mid-cost" },
    { code: "NC", name: "North Carolina", rpp: 94.7, wage: 0.93, rent: 1125, transport: 380, tax: 0.185, mood: "lower-cost" },
    { code: "TX", name: "Texas", rpp: 94.2, wage: 1.00, rent: 1200, transport: 445, tax: 0.175, mood: "lower-cost" },
    { code: "OH", name: "Ohio", rpp: 91.7, wage: 0.90, rent: 875, transport: 330, tax: 0.185, mood: "lower-cost" },
    { code: "IA", name: "Iowa", rpp: 87.8, wage: 0.89, rent: 790, transport: 315, tax: 0.175, mood: "lower-cost" },
    { code: "OK", name: "Oklahoma", rpp: 87.8, wage: 0.88, rent: 765, transport: 365, tax: 0.17, mood: "lower-cost" },
    { code: "AR", name: "Arkansas", rpp: 86.9, wage: 0.86, rent: 735, transport: 350, tax: 0.18, mood: "lower-cost" },
    { code: "MS", name: "Mississippi", rpp: 87.0, wage: 0.83, rent: 690, transport: 360, tax: 0.18, mood: "lower-cost" },
    { code: "FL", name: "Florida", rpp: 100.1, wage: 0.96, rent: 1550, transport: 420, tax: 0.175, mood: "mid-cost" }
  ],
  careers: [
    { id: "nurse", name: "Registered Nurse", base: 82500, family: "Health & care", icon: "✚" },
    { id: "developer", name: "Software Developer", base: 116000, family: "Technology", icon: "</>" },
    { id: "teacher", name: "High School Teacher", base: 60500, family: "Education", icon: "✦" },
    { id: "analyst", name: "Data Analyst", base: 73500, family: "Business", icon: "◒" },
    { id: "electrician", name: "Electrician", base: 66500, family: "Skilled trades", icon: "ϟ" },
    { id: "retail", name: "Retail Supervisor", base: 46800, family: "Service", icon: "◈" },
    { id: "designer", name: "Graphic Designer", base: 59200, family: "Creative", icon: "✎" },
    { id: "mechanic", name: "Automotive Technician", base: 54800, family: "Skilled trades", icon: "⚙" }
  ],
  households: [
    { id: "solo", name: "Solo renter", adults: 1, children: 0, home: 1.00, food: 1.00, health: 1.00, transport: 1.00, childcare: 0 },
    { id: "couple", name: "Two adults", adults: 2, children: 0, home: 1.28, food: 1.58, health: 1.55, transport: 1.22, childcare: 0 },
    { id: "family", name: "Two adults + two children", adults: 2, children: 2, home: 1.42, food: 2.15, health: 2.10, transport: 1.42, childcare: 1 },
    { id: "single-parent", name: "One adult + one child", adults: 1, children: 1, home: 1.20, food: 1.46, health: 1.45, transport: 1.18, childcare: 1 }
  ],
  modes: [
    { id: "essential", name: "Essentials only", discretionary: 0, savings: 0, description: "A minimum but adequate budget for core needs." },
    { id: "balanced", name: "Balanced life", discretionary: 275, savings: 350, description: "Core needs plus modest personal spending and emergency savings." },
    { id: "comfortable", name: "Comfortable plan", discretionary: 750, savings: 800, description: "More room for lifestyle choices, flexibility, and savings." }
  ],
  percentiles: {
    lower: { label: "25th percentile", multiplier: 0.78 },
    median: { label: "Median", multiplier: 1.00 },
    upper: { label: "75th percentile", multiplier: 1.27 }
  }
};
