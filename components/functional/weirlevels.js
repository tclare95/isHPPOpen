export default function WeirLevels (props) {
        if (props.currentLevel >= 1.9 && props.currentLevel < 2.4) {
            return(
                <div><h6><a href = "#weirs">Newark Weir should be running</a></h6></div>
            )
        } else if (props.currentLevel >= 2.4 && props.currentLevel < 2.75) {
            return(
                <div><h6><a href = "#weirs">You're out of luck on the Trent unfortunately!</a></h6></div>
                )
        } else if(props.currentLevel >=2.75 && props.currentLevel < 3.1) {
            return(
            <div><h6><a href = "#weirs">Trent Lock should be running (Longer Boats)</a></h6></div>
            )
        } else if (props.currentLevel >=3.1 && props.currentLevel < 3.5) {
            return(
            <div><h6><a href = "#weirs">Trent Lock might be running (Playboats)</a></h6></div>
            )
        } else if (props.currentLevel >=4.0 && props.currentLevel < 5.5) {
            return(
                <div><h6><a href = "#weirs">Sawley Weir might be running</a></h6></div>
                )
        } else {
            return(
                <div className="d-none"></div>
            )
    }
}