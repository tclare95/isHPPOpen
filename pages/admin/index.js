
import AdminBar from '../../components/layout/adminpage/adminbar'
import Container from 'react-bootstrap/Container'
import AdminBody from '../../components/layout/adminpage/adminbody'

export default function Admin () {
    
   return (
       <Container fluid className="bg-dark">
            <AdminBar />
            <AdminBody>
                <h2 className="text-light">Is HPP Open Admin panel - home</h2>
                <h5>Current Features:</h5>
                <p>Add, Update and Delete Events</p>
            </AdminBody>
       </Container>
       
   )
}
