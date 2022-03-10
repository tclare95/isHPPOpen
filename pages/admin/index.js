import AdminBar from "../../components/layout/adminpage/adminbar";
import Container from "react-bootstrap/Container";
import AdminBody from "../../components/layout/adminpage/adminbody";

export default function Admin() {
  return (
    <Container fluid className="bg-dark">
      <AdminBar />
      <AdminBody>
        <h2 className="text-light">Is HPP Open Admin panel - home</h2>
        <h5 className="text-light">Current Features:</h5>
        <p className="text-light">Add, Update and Delete Events</p>

        <h5 className="text-light">Changelog</h5>
        <p className="text-light">
          10/03/2022:{" "}
          <ul>
            <li>Fixed getting slots from HPP</li>
            <li>Changed admin panel to make more intuitive, including a delete event failsafe</li>
          </ul>
        </p>
      </AdminBody>
    </Container>
  );
}
