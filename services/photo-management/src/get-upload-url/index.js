
exports.handler = async (event) => {

    console.log('HURRAY...!!! Let the work begin <----->', event);

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            info: 'It worked!', 
            message: 'Welcome...! This is PBA :)'
        })
    }
}

