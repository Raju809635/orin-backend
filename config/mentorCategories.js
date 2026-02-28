const mentorCategoryTree = {
  Academic: {
    School: ["Math", "Science", "English", "Social Studies"],
    Intermediate: ["MPC", "BiPC", "MEC", "CEC"],
    Engineering: ["CSE", "ECE", "EEE", "Mechanical"],
    MBA: ["Marketing", "Finance", "Operations", "HR"],
    Law: ["Constitutional Law", "Corporate Law", "Litigation"]
  },
  "Competitive Exams": {
    JEE: ["JEE Main", "JEE Advanced", "Revision Strategy"],
    NEET: ["Biology", "Physics", "Chemistry"],
    UPSC: ["Prelims", "Mains", "Interview"],
    SSC: ["CGL", "CHSL", "Reasoning"],
    TGPSC: ["Group 1", "Group 2", "General Studies"],
    "Banking Exams": ["IBPS", "SBI PO", "Clerical"]
  },
  "Professional Courses": {
    CA: ["Foundation", "Inter", "Final"],
    CS: ["Executive", "Professional"],
    CMA: ["Foundation", "Inter", "Final"]
  },
  "Career & Placements": {
    Placements: ["Resume Review", "Mock Interviews", "Aptitude"],
    "Career Guidance": ["Roadmap Planning", "Role Selection", "Higher Studies"]
  },
  "Technology & AI": {
    "Web Development": ["Frontend", "Backend", "Full Stack"],
    "Data Science": ["Python", "Statistics", "Data Visualization"],
    "AI/ML": ["Machine Learning", "Deep Learning", "MLOps"]
  },
  "Startups & Entrepreneurship": {
    Startup: ["Idea Validation", "MVP Building", "Fundraising"],
    Growth: ["Go-To-Market", "Sales", "Team Building"]
  },
  "Finance & Investing": {
    Investing: ["Stocks", "Mutual Funds", "Portfolio Strategy"],
    Finance: ["Budgeting", "Personal Finance", "Risk Management"]
  },
  "Creative & Design": {
    Design: ["UI Design", "UX Research", "Product Design"],
    Creative: ["Branding", "Content", "Visual Storytelling"]
  },
  "Personal Development": {
    Growth: ["Communication", "Productivity", "Leadership"],
    Wellness: ["Mindset", "Work-Life Balance", "Confidence Building"]
  }
};

function getMentorCategoryOptions() {
  return Object.entries(mentorCategoryTree).map(([primary, subMap]) => ({
    primary,
    subCategories: Object.entries(subMap).map(([sub, specializations]) => ({
      sub,
      specializations
    }))
  }));
}

function isValidMentorCategorySelection(primaryCategory, subCategory, specializations) {
  const subMap = mentorCategoryTree[primaryCategory];
  if (!subMap) return false;

  const allowedSpecs = subMap[subCategory];
  if (!allowedSpecs) return false;

  if (!Array.isArray(specializations)) return false;
  if (specializations.length === 0) return false;

  return specializations.every((spec) => allowedSpecs.includes(spec));
}

module.exports = {
  mentorCategoryTree,
  getMentorCategoryOptions,
  isValidMentorCategorySelection
};
