import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react'

export function useW3mAccount() {
  return useWeb3ModalAccount()
}

export function useW3mProvider() {
  return useWeb3ModalProvider()
}

export function useW3mModal() {
  return useWeb3Modal()
}
