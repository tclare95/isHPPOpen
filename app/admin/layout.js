import PropTypes from "prop-types";
import { getServerSession } from "next-auth";
import Container from "react-bootstrap/Container";
import { authOptions } from "../../libs/auth/authOptions";
import { ADMIN_ACCESS, getAdminAccess } from "../../libs/auth/adminAccess";
import AdminBar from "../../components/layout/adminpage/adminbar";
import AdminAccessNotice from "../../components/layout/adminpage/adminaccessnotice";

export const dynamic = "force-dynamic";

/**
 * Server-side gate for every page under /admin: admin UI renders only for admins (see
 * libs/auth/adminAccess.js). Signed-out visitors and signed-in non-admins see an access notice instead.
 * The admin APIs enforce the same rule independently via requireRouteAdmin().
 */
export default async function AdminLayout({ children }) {
  const session = await getServerSession(authOptions);
  const subject = session?.user?.id || null;
  const access = session ? getAdminAccess(subject) : null;

  if (access === ADMIN_ACCESS.GRANTED) {
    return children;
  }

  return (
    <Container fluid className="bg-dark min-vh-100">
      <AdminBar />
      <Container fluid="lg" className="pb-5">
        <AdminAccessNotice state={session ? "denied" : "signed-out"} subject={subject} />
      </Container>
    </Container>
  );
}

AdminLayout.propTypes = {
  children: PropTypes.node,
};
