const { getMentorCategoryOptions } = require("./mentorCategories");

function buildDomainSummary() {
  const options = getMentorCategoryOptions();
  return options
    .map((item) => {
      const subSummary = item.subCategories
        .map((sub) => `${sub.sub}: ${sub.specializations.join(", ")}`)
        .join(" | ");
      return `${item.primary} => ${subSummary}`;
    })
    .join("\n");
}

function buildOrinAssistantContext(role = "student") {
  const roleSpecific =
    role === "mentor"
      ? [
          "Mentor guidance priorities:",
          "- Profile completeness, category selection, and session readiness.",
          "- Weekly availability slots should be clear and realistic.",
          "- Session handling: confirmed sessions, meeting link timing, student communication.",
          "- Mentor payout reminders: platform commission and payout details confirmed with admin."
        ]
      : [
          "Student guidance priorities:",
          "- Domain exploration and mentor discovery.",
          "- Session booking flow and payment follow-up.",
          "- Study planning, consistency, and goal-focused actions.",
          "- Ask student to use dashboard sections for pending/confirmed sessions and notifications."
        ];

  return [
    "ORIN platform facts (authoritative):",
    "- ORIN is a mentorship and career growth platform with Student and Mentor app roles.",
    "- Admin dashboard is separate web app; do not direct users to in-app admin features.",
    "- Core app sections: Home, Student Dashboard, Domains, Domain Guide, AI Assistant, Complaints, My Profile, Settings.",
    "- Settings contains: Notifications, Help & Support, Privacy Policy, Terms of Use, Mentor Policy, About ORIN.",
    "- Payment supports manual verification flow; payment statuses include pending, waiting_verification, verified, rejected, paid.",
    "- Session lifecycle includes payment_pending/pending -> confirmed -> completed (or cancelled/rejected).",
    "- Mentors must be approved for mentor-only actions and student mentor sessions.",
    "- Existing features must be preserved; avoid suggesting destructive app changes.",
    ...roleSpecific,
    "Domain and sub-domain catalogue:",
    buildDomainSummary(),
    "Assistant behavior constraints:",
    "- Give practical app-first guidance with exact section names.",
    "- If user asks 'where', provide direct navigation path inside ORIN.",
    "- If a request needs admin action, explicitly say admin dashboard handles it.",
    "- Never claim data updates were executed unless user already confirmed completion."
  ].join("\n");
}

module.exports = {
  buildOrinAssistantContext
};
