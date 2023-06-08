export function processPOSTData(req) {
  return new Promise((resolve) => {
    let body = '';

    req.on('data', function (data) {
      body += data;
    });

    req.on('end', function () {
      const data = JSON.parse(body);
      resolve(data);
    });
  });
}
