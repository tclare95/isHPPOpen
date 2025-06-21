// Mock implementation for next-auth/next
module.exports = {
  getServerSession: jest.fn().mockResolvedValue(null)
};