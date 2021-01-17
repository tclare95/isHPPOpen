import AdminBar from '../../components/layout/adminpage/adminbar'
import Container from 'react-bootstrap/Container'
import AdminBody from '../../components/layout/adminpage/adminbody'

export default function AdminEvents () {
    return (
        <Container fluid className="bg-dark">
             <AdminBar />
             <AdminBody>
                 <h2 className="text-light">Is HPP Open Admin panel - Events Admin</h2>
             </AdminBody>
        </Container>
        
    )
}