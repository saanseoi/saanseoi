/** Temporary entry point used only while the address storage contract is migrated. */
export default {
  fetch() {
    return Response.json(
      {
        error: 'maintenance',
        message: 'SaanSeoi is undergoing database maintenance. Please retry shortly.',
      },
      {
        status: 503,
        headers: {
          'cache-control': 'no-store',
          'retry-after': '60',
          'x-saanseoi-maintenance': 'address-premises-name-v1',
        },
      },
    )
  },
}
