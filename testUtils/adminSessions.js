// Session fixtures for admin authorization tests. jest.setup.js allowlists TEST_ADMIN_SUB.
const TEST_ADMIN_SUB = "auth0|test-admin";

const adminSession = () => ({ user: { id: TEST_ADMIN_SUB, name: "Admin", email: "admin@test.com" } });
const nonAdminSession = () => ({ user: { id: "auth0|someone-else", name: "Visitor", email: "visitor@test.com" } });

module.exports = { TEST_ADMIN_SUB, adminSession, nonAdminSession };
