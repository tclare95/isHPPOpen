import PropTypes from 'prop-types'
import { useSession } from 'next-auth/react'
import Card from 'react-bootstrap/Card'
import Container from 'react-bootstrap/Container'
import Spinner from 'react-bootstrap/Spinner'
import AdminAccessNotice from './adminaccessnotice'

// Client-side defence in depth; app/admin/layout.js is the server-side gate and the admin APIs
// enforce authorization independently.
export default function AdminBody (props) {
    const { data: session, status } = useSession()

    if (status === 'loading') {
        return (
            <Container fluid="lg" className="pb-5">
                <Card bg="dark" text="light" border="secondary" className="text-center py-5">
                    <Card.Body>
                        <Spinner animation="border" role="status" className="mb-3" />
                        <div>Checking your session…</div>
                    </Card.Body>
                </Card>
            </Container>
        )
    }

    if (!session?.user?.isAdmin) {
        return (
            <Container fluid="lg" className="pb-5">
                <AdminAccessNotice state={session ? 'denied' : 'signed-out'} subject={session?.user?.id || null} />
            </Container>
        )
    }

    return (
        <Container fluid="lg" className="pb-5">
            {props.children}
        </Container>
    )
}

AdminBody.propTypes = {
    children: PropTypes.node,
}
