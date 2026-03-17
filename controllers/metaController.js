const asyncHandler = require("../utils/asyncHandler");
const { mentorCategoryTree } = require("../config/mentorCategories");

// User-facing meta endpoints (no business logic). Keeps the mobile app in sync with Domain Guide.
exports.getDomainTree = asyncHandler(async (_req, res) => {
  const tree = mentorCategoryTree || {};
  const primaryCategories = Object.keys(tree);

  const subCategoriesByPrimary = {};
  const focusByPrimarySub = {};

  primaryCategories.forEach((primary) => {
    const subMap = tree[primary] || {};
    const subs = Object.keys(subMap);
    subCategoriesByPrimary[primary] = subs;
    subs.forEach((sub) => {
      focusByPrimarySub[`${primary}::${sub}`] = (subMap[sub] || []).slice();
    });
  });

  res.json({
    version: "domain-tree-v1",
    updatedAt: new Date().toISOString(),
    tree,
    primaryCategories,
    subCategoriesByPrimary,
    focusByPrimarySub
  });
});

