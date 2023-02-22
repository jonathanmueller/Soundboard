import { useMutation, useQuery } from '@tanstack/react-query';
import { DeviceInfo, HostInfo } from 'naudiodon';
import React, { useEffect, useState } from 'react';
import { Col, Container, Form, Image, Modal, Row } from 'react-bootstrap';
import * as Icon from 'react-bootstrap-icons';
import Button from 'react-bootstrap/Button';
import useFiles from './hooks/useFiles';
import { SoundInfo } from './model/model';

interface AudioDevices {
  devices: DeviceInfo[],
  hostApis: HostInfo[]
}


const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  // [::1] is the IPv6 localhost address.
  window.location.hostname === '[::1]' ||
  // 127.0.0.1/8 is considered localhost for IPv4.
  window.location.hostname.match(
    /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
  )
);

function Frontend() {
  const files = useFiles();

  const [selectedHostAPI, setSelectedHostAPI] = useState(localStorage.getItem('selectedHostAPI') || '');
  const [selectedDeviceId, setSelectedDeviceId] = useState(parseInt(localStorage.getItem('selectedDeviceId') || '-1') || -1);

  const [showQRCode, setShowQRCode] = useState(false);

  useEffect(() => localStorage.setItem('selectedHostAPI', selectedHostAPI), [selectedHostAPI]);
  useEffect(() => localStorage.setItem('selectedDeviceId', '' + selectedDeviceId), [selectedDeviceId]);

  console.log({ selectedHostAPI, selectedDeviceId })

  const devicesQuery = useQuery<AudioDevices>(['audiodevices'], () => fetch("/api/devices").then(r => r.json()));

  const playSound = useMutation((f: SoundInfo) => fetch("/api/play", { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `deviceId=${selectedDeviceId}&file=${encodeURIComponent(f.fileName)}` }));

  const hostApis = devicesQuery.data?.hostApis;
  const devicesForSelectedHostAPI = devicesQuery.data?.devices.filter(device => device.hostAPIName === selectedHostAPI);

  useEffect(() => {
    if (!selectedHostAPI && devicesQuery.data?.hostApis) {
      const newHostApi = devicesQuery.data.hostApis[0].name;
      const devicesForNewHostApi = devicesQuery.data.devices.filter(device => device.hostAPIName === newHostApi);
      setSelectedHostAPI(newHostApi);
      if (devicesForNewHostApi.length && devicesForNewHostApi.filter(device => device.id === selectedDeviceId).length === 0) {
        setSelectedDeviceId(devicesForNewHostApi[0].id);
      }
    }
  }, [selectedDeviceId, selectedHostAPI, devicesQuery.data]);

  useEffect(() => {
    if (selectedHostAPI) {
      if (devicesForSelectedHostAPI?.filter(device => device.id === selectedDeviceId).length === 0) {
        setSelectedDeviceId(devicesForSelectedHostAPI[0]?.id || -1);
      }
    }
  }, [devicesForSelectedHostAPI, selectedDeviceId, selectedHostAPI]);

  const { data: locationText } = useQuery<string>(["location"], () => fetch("api/location").then(r => r.json()).then(r => r.location as string));

  return (
    <Container>
      {isLocalhost &&
        <>
          <Form className=" mt-5">
            <Form.Group as={Row} className="mb-3">
              <Form.Label column xs={12} md={3} lg={2} xl={1}>Outputgerät</Form.Label>
              <Col xs={5} md={4} lg={4} xl={3}>
                <Form.Select onChange={e => setSelectedHostAPI(e.target.value)} value={selectedHostAPI}>{hostApis?.map(api => <option key={api.id} value={api.name}>{api.name}</option>)}</Form.Select>
              </Col>
              <Col xs={7} md={5} lg={6} xl={8}>
                <Form.Select onChange={e => setSelectedDeviceId(parseInt(e.target.value))} value={selectedDeviceId}>{devicesForSelectedHostAPI?.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</Form.Select>
              </Col>
            </Form.Group>
            <Form.Group as={Row} className="mb-3">
              <Form.Label column xs={12} md={3} lg={2} xl={1}></Form.Label>
              <Col xs={6} md={3}><Button onClick={() => setShowQRCode(true)}><Icon.QrCode /> URL anzeigen</Button></Col>
              {/* <Col xs={6} md={3}><Button onClick={() => fetch("api/convert", { method: "PUT" })}><Icon.FileMusic /> Neue Sounds konvertieren</Button></Col> */}
            </Form.Group>
          </Form>
          <Modal show={showQRCode} onHide={() => setShowQRCode(false)} centered>
            <Modal.Body className="text-center py-5">
              <Image src="api/location.png" />
              <span className="d-block mt-3 lead fw-bold">{locationText}</span>
            </Modal.Body>
          </Modal>
        </>
      }
      <Row className="mt-5">
        {files?.map(f => <React.Fragment key={f.fileName}>
          <Col xs={6} md={2} className="mb-4"><Button className="h-100 w-100" onClick={() => playSound.mutate(f)}>{f.title}</Button></Col>
        </React.Fragment>)}
        {files !== undefined && files.length === 0 &&
          <p className="lead text-center">
            Keine Sounds vorhanden.<br />
            Bitte Dateien ins <code>sounds/</code> Verzeichnis laden.
          </p>
        }
      </Row>
    </Container>
  );
}

export default Frontend;
