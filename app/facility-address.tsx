/**
 * Add facility by address (docs/CENTRAL_LOGIN.md): for a facility that is not
 * in the association's catalogue. The existing server address entry (typed or
 * scanned from the facility's QR code) checks the address; the facility then
 * goes on the person's list and is opened like any other.
 */
import React from 'react';
import { router } from 'expo-router';
import { OperatorServerSelection } from '@/components/OperatorServerSelection';
import { addMyFacility } from '@/config/centralFacilities';
import { getCentralState } from '@/config/centralState';
import { facilityNameOf, openFacility } from '@/config/openFacility';

export default function FacilityAddressScreen() {
  return (
    <OperatorServerSelection
      onCancel={() => router.back()}
      onChoose={({ server }) => {
        const userId = getCentralState().user?.id;
        if (!userId) return;
        const name = facilityNameOf(server);
        void (async () => {
          await addMyFacility(userId, { origin: server.origin, name, instanceId: server.instanceId });
          router.dismissTo('/facilities');
          await openFacility(server.origin, name);
        })();
      }}
    />
  );
}
